import {
  getAgentRuns,
  getInvestigationById,
  updateAgentRun,
  updateInvestigationStatus,
} from './db.ts';
import {
  fetchElevation,
  fetchModisNdviSeries,
  fetchNasaEonetAndFirms,
  fetchNasaPowerSeries,
  getNasaGibsLayers,
  searchNasaCmrDatasets,
} from './envData.ts';
import {
  runCauseInvestigatorAI,
  runEarthJudgeAI,
  runImpactAnalystAI,
  runScienceChallengerAI,
} from './gemini.ts';
import { runPythonStats } from './pythonRunner.ts';
import { ENVIRONMENTAL_VARIABLES, type InvestigationRecord } from './types.ts';

const cancelledRuns = new Set<string>();

export function cancelInvestigationRun(investigationId: string): boolean {
  cancelledRuns.add(investigationId);
  updateInvestigationStatus(investigationId, {
    status: 'cancelled',
    current_agent: 'Cancelled by user',
  });
  return true;
}

function checkCancelled(investigationId: string): void {
  if (cancelledRuns.has(investigationId)) {
    throw new Error('INVESTIGATION_CANCELLED');
  }
}

export async function runInvestigationPipeline(investigationId: string): Promise<void> {
  cancelledRuns.delete(investigationId);
  const inv = getInvestigationById(investigationId);
  if (!inv) throw new Error(`Investigation ${investigationId} not found`);

  const selectedVars: string[] = JSON.parse(inv.variables_json || '["PRECTOTCORR","GWETTOP","T2M","TS","NDVI"]');
  const regionLabel = [inv.district, inv.state, inv.country].filter(Boolean).join(', ') || inv.region_name;
  const periodLabel = `${inv.start_date} to ${inv.end_date}`;

  // Ensure elevations are populated from Open-Meteo Elevation API
  const primaryElev = inv.elevation_m ?? (await fetchElevation(inv.latitude, inv.longitude));
  let compLat = inv.comparison_lat;
  let compLon = inv.comparison_lon;
  let compName = inv.comparison_region_name;
  if (compLat == null || compLon == null) {
    // Default contrasting comparison transect (+1.5° lat, +1.5° lon) so Opposite Trend Detector always has real comparable observations
    compLat = Math.max(-85, Math.min(85, Number((inv.latitude + 1.5).toFixed(4))));
    compLon = Math.max(-179, Math.min(179, Number((inv.longitude + 1.5).toFixed(4))));
    compName = `${inv.region_name} Regional Reference (+1.5° NE)`;
  }
  const compElev = inv.comparison_elevation_m ?? (await fetchElevation(compLat, compLon));
  updateInvestigationStatus(investigationId, {
    elevation_m: primaryElev,
    comparison_elevation_m: compElev,
  });

  try {
    // =========================================================================
    // AGENT 1: DATA SCOUT
    // =========================================================================
    checkCancelled(investigationId);
    updateInvestigationStatus(investigationId, { status: 'running', progress_pct: 5, current_agent: 'Data Scout' });
    updateAgentRun(investigationId, 'data_scout', { status: 'running', started_at: new Date().toISOString() });

    const cmrKeywords = [
      inv.category,
      selectedVars.includes('PRECTOTCORR') ? 'GPM IMERG' : 'MERRA-2',
      selectedVars.includes('GWETTOP') || selectedVars.includes('GWETROOT') ? 'SMAP soil moisture' : 'MODIS land surface',
      'MOD13Q1',
    ];
    const [powerPrimary, powerComp, modisPrimary, cmrCatalog, hazards] = await Promise.all([
      fetchNasaPowerSeries(inv.latitude, inv.longitude, inv.start_date, inv.end_date, selectedVars),
      fetchNasaPowerSeries(compLat, compLon, inv.start_date, inv.end_date, selectedVars),
      selectedVars.includes('NDVI')
        ? fetchModisNdviSeries(inv.latitude, inv.longitude, inv.start_date, inv.end_date)
        : Promise.resolve(null),
      searchNasaCmrDatasets(cmrKeywords),
      fetchNasaEonetAndFirms(inv.latitude, inv.longitude),
    ]);

    const datasetsTable: any[] = [];
    const seriesForPython: any[] = [];
    const comparisonPairs: any[] = [];

    if (powerPrimary.available) {
      for (const [varCode, s] of Object.entries(powerPrimary.series)) {
        const meta = ENVIRONMENTAL_VARIABLES.find((v) => v.code === varCode);
        const total = s.values.length;
        const missing = s.values.filter((v) => v === null || v === undefined).length;
        const missingPct = total > 0 ? Math.round((missing / total) * 10000) / 100 : 100;
        datasetsTable.push({
          dataset: meta?.dataset ?? `NASA POWER ${varCode}`,
          mission: s.mission,
          variable: varCode,
          label: s.label,
          unit: s.unit,
          timePeriod: `${powerPrimary.dates[0] ?? inv.start_date} → ${powerPrimary.dates[powerPrimary.dates.length - 1] ?? inv.end_date}`,
          spatialResolution: powerPrimary.spatialResolution,
          temporalResolution: powerPrimary.temporalResolution,
          geographicCoverage: `${inv.latitude.toFixed(3)}°, ${inv.longitude.toFixed(3)}° (${regionLabel})`,
          missingPct,
          validPoints: total - missing,
          totalPoints: total,
          quality: missingPct <= 5 ? 'High' : missingPct <= 20 ? 'Moderate' : 'Degraded',
          freshnessStatus: powerPrimary.freshnessStatus,
          sourceUrl: meta?.sourceUrl ?? powerPrimary.sourceUrl,
        });
        seriesForPython.push({
          variable: varCode,
          label: s.label,
          unit: s.unit,
          dates: powerPrimary.dates,
          values: s.values,
        });

        const compSeries = powerComp.available ? powerComp.series[varCode] : null;
        if (compSeries) {
          comparisonPairs.push({
            region_a: {
              region_name: inv.region_name,
              variable: varCode,
              unit: s.unit,
              dates: powerPrimary.dates,
              values: s.values,
            },
            region_b: {
              region_name: compName,
              variable: varCode,
              unit: compSeries.unit,
              dates: powerComp.dates,
              values: compSeries.values,
            },
          });
        }
      }
    }

    if (modisPrimary && modisPrimary.available) {
      const total = modisPrimary.values.length;
      const missing = modisPrimary.values.filter((v: any) => v === null).length;
      const missingPct = total > 0 ? Math.round((missing / total) * 10000) / 100 : 100;
      datasetsTable.push({
        dataset: 'MOD13Q1 v061 Vegetation Indices (ORNL DAAC)',
        mission: 'NASA Terra MODIS',
        variable: 'NDVI',
        label: 'Normalized Difference Vegetation Index',
        unit: 'NDVI (-0.2 to 1.0)',
        timePeriod: `${modisPrimary.dates[0]} → ${modisPrimary.dates[modisPrimary.dates.length - 1]}`,
        spatialResolution: '250 m',
        temporalResolution: '16-day composite (sampled)',
        geographicCoverage: `${inv.latitude.toFixed(3)}°, ${inv.longitude.toFixed(3)}° (${regionLabel})`,
        missingPct,
        validPoints: total - missing,
        totalPoints: total,
        quality: missingPct <= 10 ? 'High' : missingPct <= 25 ? 'Moderate' : 'Degraded',
        freshnessStatus: modisPrimary.freshnessStatus,
        sourceUrl: modisPrimary.sourceUrl,
      });
      seriesForPython.push({
        variable: 'NDVI',
        label: 'MODIS NDVI (250m)',
        unit: 'NDVI',
        dates: modisPrimary.dates,
        values: modisPrimary.values,
      });
    }

    const dataScoutOut = {
      datasets: datasetsTable,
      cmrCollections: cmrCatalog.entries ?? [],
      eonetNearbyEvents: hazards.nearbyEvents ?? [],
      firmsStatus: hazards.firms,
      powerSource: powerPrimary,
      modisSource: modisPrimary,
      retrievedAt: new Date().toISOString(),
    };

    updateAgentRun(investigationId, 'data_scout', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: datasetsTable.length + (cmrCatalog.entries?.length ?? 0),
      output_json: JSON.stringify(dataScoutOut),
    });

    // =========================================================================
    // AGENT 2: TREND DETECTIVE (Python Engine)
    // =========================================================================
    checkCancelled(investigationId);
    updateInvestigationStatus(investigationId, { progress_pct: 22, current_agent: 'Trend Detective' });
    updateAgentRun(investigationId, 'trend_detective', { status: 'running', started_at: new Date().toISOString() });

    const pyBatch = await runPythonStats<any>('batch_investigation', {
      series: seriesForPython,
      comparisons: comparisonPairs,
    });

    const trends: any[] = pyBatch.trends ?? [];
    const oppositeTrends: any[] = pyBatch.opposite_trends ?? [];

    const increasingTrends = trends.filter((t) => t.classification === 'increasing');
    const decreasingTrends = trends.filter((t) => t.classification === 'decreasing');
    const stableTrends = trends.filter((t) => t.classification === 'stable');
    const anomalyTotal = trends.reduce((acc, t) => acc + (t.anomalies?.anomaly_count ?? 0), 0);

    const trendDetectiveOut = {
      trends,
      increasingTrends,
      decreasingTrends,
      stableTrends,
      oppositeTrends,
      anyOppositeTrendsDetected: oppositeTrends.some((c) => c.opposite_trends_detected),
      primaryComparison: oppositeTrends[0] ?? null,
      anomalyTotal,
      pythonEngineVersion: 'Pure Python 3.10 SciStats (OLS, Mann-Kendall, Sen, Pettitt, Seasonal)',
    };

    updateAgentRun(investigationId, 'trend_detective', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: trends.length + oppositeTrends.filter((o) => o.opposite_trends_detected).length,
      output_json: JSON.stringify(trendDetectiveOut),
    });

    // =========================================================================
    // AGENT 3: GEO INTELLIGENCE (Multi-Point Spatial Grid + Elevation)
    // =========================================================================
    checkCancelled(investigationId);
    updateInvestigationStatus(investigationId, { progress_pct: 38, current_agent: 'Geo Intelligence' });
    updateAgentRun(investigationId, 'geo_intelligence', { status: 'running', started_at: new Date().toISOString() });

    const gridOffsets = [
      { label: `${inv.region_name} (Center)`, dLat: 0, dLon: 0 },
      { label: `${inv.region_name} North (+0.6°)`, dLat: 0.6, dLon: 0 },
      { label: `${inv.region_name} South (-0.6°)`, dLat: -0.6, dLon: 0 },
      { label: `${inv.region_name} East (+0.6°)`, dLat: 0, dLon: 0.6 },
      { label: `${inv.region_name} West (-0.6°)`, dLat: 0, dLon: -0.6 },
    ];

    const primaryVar = selectedVars.find((v) => v !== 'NDVI' && powerPrimary.series[v]) ?? Object.keys(powerPrimary.series)[0] ?? 'T2M';
    const geoLocations = await Promise.all(
      gridOffsets.map(async (pt, idx) => {
        const lat = Number(Math.max(-85, Math.min(85, inv.latitude + pt.dLat)).toFixed(4));
        const lon = Number(Math.max(-179, Math.min(179, inv.longitude + pt.dLon)).toFixed(4));
        const [elev, pSeries] = await Promise.all([
          idx === 0 && primaryElev !== null ? Promise.resolve(primaryElev) : fetchElevation(lat, lon),
          idx === 0
            ? Promise.resolve(powerPrimary)
            : fetchNasaPowerSeries(lat, lon, inv.start_date, inv.end_date, [primaryVar]),
        ]);
        const s = pSeries.series?.[primaryVar];
        const validVals = (s?.values ?? []).filter((v): v is number => v !== null);
        const initialVal = validVals[0] ?? null;
        const latestVal = validVals[validVals.length - 1] ?? null;
        const meanVal = validVals.length > 0 ? Math.round((validVals.reduce((a, b) => a + b, 0) / validVals.length) * 1000) / 1000 : null;
        const changeMag = initialVal !== null && latestVal !== null ? Math.round((latestVal - initialVal) * 1000) / 1000 : 0;

        // Quick python trend classification for each spatial node
        let trendDir = 'stable';
        if (validVals.length >= 6) {
          const pyPt = await runPythonStats<any>('analyze_series', {
            variable: primaryVar,
            unit: s?.unit ?? '',
            dates: pSeries.dates,
            values: s?.values ?? [],
          });
          trendDir = pyPt.classification ?? 'stable';
        }

        return {
          id: `loc_${idx}`,
          name: pt.label,
          country: inv.country,
          state: inv.state,
          district: inv.district,
          latitude: lat,
          longitude: lon,
          elevation_m: elev,
          variable: primaryVar,
          unit: s?.unit ?? '',
          latestValue: latestVal,
          meanValue: meanVal,
          changeMagnitude: changeMag,
          trendDirection: trendDir,
          observationPeriod: periodLabel,
          spatialResolution: pSeries.spatialResolution,
          dates: pSeries.dates,
          values: s?.values ?? [],
        };
      })
    );

    // Add comparison region as an additional spatial marker
    if (powerComp.available && powerComp.series[primaryVar]) {
      const cs = powerComp.series[primaryVar];
      const validVals = cs.values.filter((v): v is number => v !== null);
      const initV = validVals[0] ?? null;
      const endV = validVals[validVals.length - 1] ?? null;
      geoLocations.push({
        id: 'loc_comparison',
        name: compName ?? 'Comparison Region',
        country: inv.country,
        state: inv.state,
        district: compName ?? 'Comparison',
        latitude: compLat,
        longitude: compLon,
        elevation_m: compElev,
        variable: primaryVar,
        unit: cs.unit,
        latestValue: endV,
        meanValue: validVals.length > 0 ? Math.round((validVals.reduce((a, b) => a + b, 0) / validVals.length) * 1000) / 1000 : null,
        changeMagnitude: initV !== null && endV !== null ? Math.round((endV - initV) * 1000) / 1000 : 0,
        trendDirection: oppositeTrends.find((o) => o.variable === primaryVar)?.region_b?.classification ?? 'stable',
        observationPeriod: periodLabel,
        spatialResolution: powerComp.spatialResolution,
        dates: powerComp.dates,
        values: cs.values,
      });
    }

    const geoOut = {
      primaryVariable: primaryVar,
      locations: geoLocations,
      gibsLayers: getNasaGibsLayers(inv.end_date),
      eonetEvents: hazards.nearbyEvents ?? [],
    };

    updateAgentRun(investigationId, 'geo_intelligence', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: geoLocations.length,
      output_json: JSON.stringify(geoOut),
    });

    // =========================================================================
    // AGENT 4: RELATIONSHIP ANALYST
    // =========================================================================
    checkCancelled(investigationId);
    updateInvestigationStatus(investigationId, { progress_pct: 52, current_agent: 'Relationship Analyst' });
    updateAgentRun(investigationId, 'relationship_analyst', { status: 'running', started_at: new Date().toISOString() });

    const relOut = pyBatch.relationships ?? { status: 'insufficient_variables', pairs: [], matrix: [] };
    updateAgentRun(investigationId, 'relationship_analyst', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: relOut.pairs?.length ?? 0,
      output_json: JSON.stringify(relOut),
    });

    // Summaries for downstream AI agents (strictly verified numbers only)
    const trendsSummary = trends.map((t) => ({
      variable: t.variable,
      unit: t.unit,
      status: t.status,
      classification: t.classification,
      initial: t.initial_value,
      final: t.final_value,
      abs_change: t.absolute_change,
      slope: t.ols?.slope,
      p_value: t.ols?.p_value,
      r2: t.ols?.r2,
      sen_slope: t.sens_slope?.slope,
      mk_p: t.mann_kendall_deseasonalized?.p_modified ?? t.mann_kendall?.p_value,
      mk_significant: t.mann_kendall_deseasonalized?.significant ?? t.mann_kendall?.significant,
      missing_pct: t.missing_pct,
      anomalies_count: t.anomalies?.anomaly_count ?? 0,
      change_point: t.change_point?.detected ? t.change_point.change_date : null,
    }));

    const relationshipsSummary = (relOut.pairs ?? []).map((p: any) => ({
      var_x: p.var_x,
      var_y: p.var_y,
      pearson_r: p.pearson_r,
      pearson_p: p.pearson_p,
      spearman_rho: p.spearman_rho,
      best_lag: p.best_lag,
      best_lag_r: p.best_lag_r,
      concern_level: p.concern_level,
    }));

    // =========================================================================
    // AGENT 5: CAUSE INVESTIGATOR
    // =========================================================================
    checkCancelled(investigationId);
    updateInvestigationStatus(investigationId, { progress_pct: 64, current_agent: 'Cause Investigator' });
    updateAgentRun(investigationId, 'cause_investigator', { status: 'running', started_at: new Date().toISOString() });

    const causeOut = await runCauseInvestigatorAI({
      question: inv.research_question,
      category: inv.category,
      regionLabel,
      period: periodLabel,
      trendsSummary,
      relationshipsSummary,
      datasets: datasetsTable.map((d) => `${d.mission}: ${d.dataset}`),
    });

    updateAgentRun(investigationId, 'cause_investigator', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: causeOut.hypotheses?.length ?? 0,
      output_json: JSON.stringify(causeOut),
    });

    // =========================================================================
    // AGENT 6: SCIENCE CHALLENGER
    // =========================================================================
    checkCancelled(investigationId);
    updateInvestigationStatus(investigationId, { progress_pct: 76, current_agent: 'Science Challenger' });
    updateAgentRun(investigationId, 'science_challenger', { status: 'running', started_at: new Date().toISOString() });

    const challengeMetrics = pyBatch.challenge_metrics ?? { projections: [] };
    const challengerAI = await runScienceChallengerAI({
      question: inv.research_question,
      regionLabel,
      period: periodLabel,
      trendsSummary,
      relationshipsSummary,
      hypotheses: causeOut.hypotheses ?? [],
      challengeMetrics,
      oppositeTrends: oppositeTrends.map((o) => ({
        variable: o.variable,
        detected: o.opposite_trends_detected,
        summary: o.summary,
      })),
    });

    const challengerOut = {
      ...challengerAI,
      projections: challengeMetrics.projections ?? [],
      contradictionAudit: trends.map((t) => ({
        variable: t.variable,
        ols_p: t.ols?.p_value ?? 1,
        mk_p: t.mann_kendall_deseasonalized?.p_modified ?? t.mann_kendall?.p_value ?? 1,
        disagreement: (t.ols?.p_value < 0.05) !== (t.mann_kendall_deseasonalized?.significant ?? false),
        missing_pct: t.missing_pct,
        autocorr: Math.abs(t.mann_kendall?.lag1_autocorr ?? 0),
      })),
    };

    updateAgentRun(investigationId, 'science_challenger', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: (challengerAI.challenges?.length ?? 0) + (challengerAI.rejected_claims?.length ?? 0),
      output_json: JSON.stringify(challengerOut),
    });

    // =========================================================================
    // AGENT 7: IMPACT ANALYST
    // =========================================================================
    checkCancelled(investigationId);
    updateInvestigationStatus(investigationId, { progress_pct: 88, current_agent: 'Impact Analyst' });
    updateAgentRun(investigationId, 'impact_analyst', { status: 'running', started_at: new Date().toISOString() });

    const impactAI = await runImpactAnalystAI({
      question: inv.research_question,
      category: inv.category,
      regionLabel,
      trendsSummary,
      challenges: challengerAI.challenges ?? [],
    });

    const impactOut = {
      ...impactAI,
      regionalImpacts: geoLocations.map((loc) => ({
        location: loc.name,
        changeMagnitude: loc.changeMagnitude,
        trendDirection: loc.trendDirection,
        elevation_m: loc.elevation_m,
      })),
      variableVsImpact: trends.map((t) => ({
        variable: t.variable,
        abs_z_slope: Math.abs(t.mann_kendall?.z_stat ?? 0),
        missing_pct: t.missing_pct,
        classification: t.classification,
      })),
    };

    updateAgentRun(investigationId, 'impact_analyst', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: impactAI.impacts?.length ?? 0,
      output_json: JSON.stringify(impactOut),
    });

    // =========================================================================
    // AGENT 8: EARTH JUDGE
    // =========================================================================
    checkCancelled(investigationId);
    updateInvestigationStatus(investigationId, { progress_pct: 95, current_agent: 'Earth Judge' });
    updateAgentRun(investigationId, 'earth_judge', { status: 'running', started_at: new Date().toISOString() });

    const judgeAI = await runEarthJudgeAI({
      question: inv.research_question,
      regionLabel,
      period: periodLabel,
      datasets: datasetsTable.map((d) => `${d.mission}: ${d.dataset}`),
      trendsSummary,
      oppositeTrends: oppositeTrends.map((o) => ({ variable: o.variable, detected: o.opposite_trends_detected, summary: o.summary })),
      relationshipsSummary,
      hypotheses: causeOut.hypotheses ?? [],
      challenges: challengerAI.challenges ?? [],
      impacts: impactAI.impacts ?? [],
    });

    const references = [
      ...datasetsTable.map((d) => ({ title: `${d.mission} — ${d.dataset}`, url: d.sourceUrl })),
      { title: 'NASA Earthdata Common Metadata Repository (CMR)', url: 'https://cmr.earthdata.nasa.gov/' },
      { title: 'NASA GIBS / Worldview Satellite Imagery', url: 'https://worldview.earthdata.nasa.gov/' },
      { title: 'Open-Meteo Elevation & Meteorological API', url: 'https://open-meteo.com/' },
    ];

    const judgeOut = {
      ...judgeAI,
      researchQuestion: inv.research_question,
      studyArea: regionLabel,
      coordinates: `${inv.latitude.toFixed(4)}°, ${inv.longitude.toFixed(4)}° (Elev: ${primaryElev ?? 'N/A'} m)`,
      observationPeriod: periodLabel,
      datasetsUsed: datasetsTable,
      trendsSummary,
      oppositeTrendsSummary: oppositeTrends.map((o) => ({
        variable: o.variable,
        detected: o.opposite_trends_detected,
        summary: o.summary,
      })),
      relationshipsSummary,
      hypotheses: causeOut.hypotheses ?? [],
      challengesSummary: challengerAI.challenges ?? [],
      rejectedClaims: challengerAI.rejected_claims ?? [],
      impactsSummary: impactAI.impacts ?? [],
      references,
    };

    updateAgentRun(investigationId, 'earth_judge', {
      status: 'completed',
      completed_at: new Date().toISOString(),
      findings_count: judgeAI.recommended_actions?.length ?? 3,
      output_json: JSON.stringify(judgeOut),
    });

    updateInvestigationStatus(investigationId, {
      status: 'completed',
      progress_pct: 100,
      current_agent: 'Completed',
      verdict: judgeOut.verdict,
      summary: judgeOut.executive_summary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'INVESTIGATION_CANCELLED') {
      const runs = getAgentRuns(investigationId);
      for (const r of runs) {
        if (r.status === 'running' || r.status === 'pending') {
          updateAgentRun(investigationId, r.agent_key, { status: 'cancelled' });
        }
      }
      return;
    }

    updateInvestigationStatus(investigationId, {
      status: 'error',
      current_agent: `Error: ${msg}`,
    });
    const runs = getAgentRuns(investigationId);
    for (const r of runs) {
      if (r.status === 'running') {
        updateAgentRun(investigationId, r.agent_key, { status: 'error', error_message: msg });
      }
    }
  }
}

export function extractAgentOutputs(investigationId: string) {
  const runs = getAgentRuns(investigationId);
  const map: Record<string, any> = {};
  for (const r of runs) {
    try {
      map[r.agent_key] = r.output_json ? JSON.parse(r.output_json) : null;
    } catch {
      map[r.agent_key] = null;
    }
  }
  return { runs, outputs: map };
}
