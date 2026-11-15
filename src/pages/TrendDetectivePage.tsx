import React, { useMemo, useState } from 'react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { ScientificChart } from '../components/charts/ScientificChart';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface TrendDetectivePageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

type PositiveGraphTab = 'increasing' | 'decreasing' | 'stable' | 'anomaly' | 'combined';
type OppositeGraphTab = 'region_a' | 'region_b' | 'side_by_side' | 'combined' | 'difference';

export const TrendDetectivePage: React.FC<TrendDetectivePageProps> = ({ bundle, onNavigate }) => {
  const trendOut = bundle?.outputs?.trend_detective;
  const inv = bundle?.investigation ?? null;

  const [posTab, setPosTab] = useState<PositiveGraphTab>('increasing');
  const [oppTab, setOppTab] = useState<OppositeGraphTab>('side_by_side');
  const [selectedVarIdx, setSelectedVarIdx] = useState(0);
  const [selectedOppIdx, setSelectedOppIdx] = useState(0);

  const trends: any[] = trendOut?.trends ?? [];
  const oppositeTrends: any[] = trendOut?.oppositeTrends ?? [];

  const activeTrend = useMemo(() => {
    if (posTab === 'increasing' && trendOut?.increasingTrends?.length > 0) return trendOut.increasingTrends[0];
    if (posTab === 'decreasing' && trendOut?.decreasingTrends?.length > 0) return trendOut.decreasingTrends[0];
    if (posTab === 'stable' && trendOut?.stableTrends?.length > 0) return trendOut.stableTrends[0];
    return trends[selectedVarIdx] ?? trends[0] ?? null;
  }, [posTab, trendOut, trends, selectedVarIdx]);

  const activeOpp = oppositeTrends[selectedOppIdx] ?? oppositeTrends[0] ?? null;

  const normalize = (vals: (number | null)[]) => {
    const valid = vals.filter((v): v is number => v !== null && Number.isFinite(v));
    if (valid.length === 0) return vals;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const span = max - min || 1;
    return vals.map((v) => (v !== null && Number.isFinite(v) ? Math.round(((v - min) / span) * 1000) / 1000 : null));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 2 — Trend Detective"
        description="Two independent Python statistical modules: (A) Positive Trend Detective using OLS, Mann-Kendall (Hamed-Rao), Sen's slope, seasonal decomposition, Z-score anomalies, and Pettitt change-points; and (B) Opposite Regional Trend Detector."
        contextLine={
          inv
            ? `Study: ${inv.region_name} (${inv.start_date} to ${inv.end_date}) · Engine: ${trendOut?.pythonEngineVersion ?? 'Python SciStats'}`
            : 'No active investigation'
        }
      />

      {!trendOut ? (
        <AgentEmptyState agentName="Trend Detective" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <>
          {/* Summary Statistics Table across all analyzed variables */}
          <section className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-[#E8F2ED]">Statistical Trend Summary (Python Verified)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#9DB2A7]/15 text-[#9DB2A7] text-left">
                    <th className="py-2 pr-3">Variable</th>
                    <th className="py-2 pr-3">Classification</th>
                    <th className="py-2 pr-3 text-right">Initial → Final</th>
                    <th className="py-2 pr-3 text-right">OLS Slope (p)</th>
                    <th className="py-2 pr-3 text-right">Sen&apos;s Slope [95% CI]</th>
                    <th className="py-2 pr-3 text-right">MK Deseason. p</th>
                    <th className="py-2 pr-3 text-right">Anomalies</th>
                    <th className="py-2">Change-Point / Regime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#9DB2A7]/10 font-mono">
                  {trends.map((t, idx) => (
                    <tr
                      key={t.variable}
                      onClick={() => setSelectedVarIdx(idx)}
                      className={`cursor-pointer hover:bg-[#0B1C17]/70 ${selectedVarIdx === idx ? 'bg-[#0B1C17]' : ''}`}
                    >
                      <td className="py-2.5 pr-3 text-[#35C99A] font-semibold">
                        {t.variable} <span className="text-[#9DB2A7] font-normal">({t.unit})</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={
                            t.classification === 'increasing'
                              ? 'text-[#35C99A]'
                              : t.classification === 'decreasing'
                              ? 'text-[#B58C5A]'
                              : 'text-[#65B8D5]'
                          }
                        >
                          {t.classification}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-[#E8F2ED]">
                        {t.initial_value} → {t.final_value}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {t.ols?.slope} (p={t.ols?.p_value})
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {t.sens_slope?.slope} [{t.sens_slope?.ci_low}, {t.sens_slope?.ci_high}]
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {t.mann_kendall_deseasonalized?.p_modified}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {t.anomalies?.anomaly_count ?? 0}
                      </td>
                      <td className="py-2.5 font-sans text-[#9DB2A7]">
                        {t.change_point?.detected ? `Shift @ ${t.change_point.change_date}` : t.acceleration?.regime}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* MODULE A: POSITIVE TREND DETECTIVE */}
          <section className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#E8F2ED]">Module A — Positive Trend Detective</h2>
                <p className="text-xs text-[#9DB2A7]">
                  Inspect each trend category, Z-score anomalies, and multi-variable comparisons separately.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {trends.map((t, idx) => (
                  <button
                    key={t.variable}
                    onClick={() => setSelectedVarIdx(idx)}
                    className={`px-2.5 py-1 rounded text-xs font-mono ${
                      selectedVarIdx === idx
                        ? 'bg-[#65B8D5]/20 text-[#65B8D5] border border-[#65B8D5]/40'
                        : 'bg-[#10251E] text-[#9DB2A7] border border-[#9DB2A7]/15'
                    }`}
                  >
                    {t.variable}
                  </button>
                ))}
              </div>
            </div>

            {/* Clearly Visible Graph Navigation Tabs (5 named graphs) */}
            <div className="flex flex-wrap gap-2 bg-[#0B1C17] p-1.5 rounded-xl border border-[#9DB2A7]/15">
              {(
                [
                  { id: 'increasing', label: `Increasing Trend (${trendOut.increasingTrends?.length ?? 0})` },
                  { id: 'decreasing', label: `Decreasing Trend (${trendOut.decreasingTrends?.length ?? 0})` },
                  { id: 'stable', label: `Stable Trend (${trendOut.stableTrends?.length ?? 0})` },
                  { id: 'anomaly', label: `Anomaly Detection (${trendOut.anomalyTotal ?? 0})` },
                  { id: 'combined', label: 'Combined Trend Comparison' },
                ] as { id: PositiveGraphTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setPosTab(tab.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    posTab === tab.id
                      ? 'bg-[#10251E] text-[#35C99A] border border-[#35C99A]/40'
                      : 'text-[#9DB2A7] hover:text-[#E8F2ED]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Render Active Positive Trend Graph */}
            {posTab === 'increasing' && (
              <ScientificChart
                title={
                  trendOut.increasingTrends?.length > 0
                    ? `Increasing Trend Graph — ${trendOut.increasingTrends[0].variable}`
                    : 'Increasing Trend Graph'
                }
                xLabel="Observation Date"
                yLabel={trendOut.increasingTrends?.[0]?.variable ?? 'Value'}
                unit={trendOut.increasingTrends?.[0]?.unit ?? ''}
                source="NASA POWER / MODIS + Python OLS & Mann-Kendall"
                dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
                dataNotes={
                  trendOut.increasingTrends?.[0]
                    ? `OLS Slope: ${trendOut.increasingTrends[0].ols.slope} (p=${trendOut.increasingTrends[0].ols.p_value}), Sen's Slope: ${trendOut.increasingTrends[0].sens_slope.slope}`
                    : 'No statistically significant increasing trend detected.'
                }
                labels={trendOut.increasingTrends?.[0]?.dates ?? []}
                series={
                  trendOut.increasingTrends?.[0]
                    ? [
                        {
                          id: 'obs',
                          label: 'Observed',
                          color: '#35C99A',
                          values: trendOut.increasingTrends[0].values,
                        },
                        {
                          id: 'ols',
                          label: 'OLS Trend & 95% CI',
                          color: '#65B8D5',
                          values: trendOut.increasingTrends[0].ols.fitted,
                          ciLow: trendOut.increasingTrends[0].ols.ci_low,
                          ciHigh: trendOut.increasingTrends[0].ols.ci_high,
                          dashed: true,
                        },
                      ]
                    : []
                }
                emptyMessage="No environmental variables in this investigation exhibited a statistically significant increasing trend (p < 0.05)."
              />
            )}

            {posTab === 'decreasing' && (
              <ScientificChart
                title={
                  trendOut.decreasingTrends?.length > 0
                    ? `Decreasing Trend Graph — ${trendOut.decreasingTrends[0].variable}`
                    : 'Decreasing Trend Graph'
                }
                xLabel="Observation Date"
                yLabel={trendOut.decreasingTrends?.[0]?.variable ?? 'Value'}
                unit={trendOut.decreasingTrends?.[0]?.unit ?? ''}
                source="NASA POWER / MODIS + Python OLS & Mann-Kendall"
                dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
                dataNotes={
                  trendOut.decreasingTrends?.[0]
                    ? `OLS Slope: ${trendOut.decreasingTrends[0].ols.slope} (p=${trendOut.decreasingTrends[0].ols.p_value}), Sen's Slope: ${trendOut.decreasingTrends[0].sens_slope.slope}`
                    : 'No statistically significant decreasing trend detected.'
                }
                labels={trendOut.decreasingTrends?.[0]?.dates ?? []}
                series={
                  trendOut.decreasingTrends?.[0]
                    ? [
                        {
                          id: 'obs',
                          label: 'Observed',
                          color: '#B58C5A',
                          values: trendOut.decreasingTrends[0].values,
                        },
                        {
                          id: 'ols',
                          label: 'OLS Trend & 95% CI',
                          color: '#65B8D5',
                          values: trendOut.decreasingTrends[0].ols.fitted,
                          ciLow: trendOut.decreasingTrends[0].ols.ci_low,
                          ciHigh: trendOut.decreasingTrends[0].ols.ci_high,
                          dashed: true,
                        },
                      ]
                    : []
                }
                emptyMessage="No environmental variables in this investigation exhibited a statistically significant decreasing trend (p < 0.05)."
              />
            )}

            {posTab === 'stable' && (
              <ScientificChart
                title={
                  trendOut.stableTrends?.length > 0
                    ? `Stable Trend Graph — ${trendOut.stableTrends[0].variable}`
                    : 'Stable Trend Graph'
                }
                xLabel="Observation Date"
                yLabel={trendOut.stableTrends?.[0]?.variable ?? 'Value'}
                unit={trendOut.stableTrends?.[0]?.unit ?? ''}
                source="NASA POWER / MODIS + Python Seasonal Decomposition"
                dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
                dataNotes="Stable classification means neither deseasonalized Mann-Kendall nor OLS detected p < 0.05 directional drift."
                labels={trendOut.stableTrends?.[0]?.dates ?? []}
                series={
                  trendOut.stableTrends?.[0]
                    ? [
                        {
                          id: 'obs',
                          label: 'Observed',
                          color: '#65B8D5',
                          values: trendOut.stableTrends[0].values,
                        },
                        {
                          id: 'deseason',
                          label: 'Deseasonalized Series',
                          color: '#35C99A',
                          values: trendOut.stableTrends[0].seasonal_decomposition.deseasonalized,
                          dashed: true,
                        },
                      ]
                    : []
                }
                emptyMessage="All variables in this investigation showed significant directional trends rather than stable regimes."
              />
            )}

            {posTab === 'anomaly' && activeTrend && (
              <ScientificChart
                title={`Anomaly Detection Graph (Z-Score) — ${activeTrend.variable}`}
                xLabel="Observation Date"
                yLabel="Standardized Z-Score"
                unit="σ (std dev)"
                source="Python Z-Score & Pettitt Change-Point Engine"
                dateRange={`${activeTrend.start_date} to ${activeTrend.end_date}`}
                dataNotes={`Detected ${activeTrend.anomalies?.anomaly_count ?? 0} anomalies (|Z| >= 2.0) and ${activeTrend.anomalies?.sudden_changes?.length ?? 0} sudden step shifts.`}
                labels={activeTrend.dates}
                referenceLines={[
                  { value: 2.0, label: '+2σ Threshold', color: '#B58C5A' },
                  { value: -2.0, label: '-2σ Threshold', color: '#B58C5A' },
                  { value: 0, label: 'Baseline Mean', color: '#9DB2A7' },
                ]}
                markers={[
                  ...(activeTrend.anomalies?.anomalies ?? []).map((a: any) => ({
                    index: a.index,
                    label: `${a.date} (Z=${a.z_score})`,
                    color: '#F59E0B',
                  })),
                  ...(activeTrend.change_point?.detected
                    ? [{ index: activeTrend.change_point.index, label: 'Pettitt Change-Point', color: '#65B8D5' }]
                    : []),
                ]}
                series={[
                  {
                    id: 'zscore',
                    label: `${activeTrend.variable} Z-Score`,
                    color: '#35C99A',
                    values: activeTrend.anomalies?.z_scores ?? [],
                  },
                ]}
              />
            )}

            {posTab === 'combined' && trends.length > 0 && (
              <ScientificChart
                title="Combined Trend Comparison Graph (Min-Max Normalized [0–1])"
                xLabel="Observation Date"
                yLabel="Normalized Index"
                unit="0–1 normalized"
                source="NASA POWER / MODIS Multi-Variable Comparison"
                dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
                dataNotes="Each variable is min-max normalized to [0, 1] over the study period for direct directional comparison."
                labels={trends[0].dates}
                series={trends.slice(0, 5).map((t, idx) => ({
                  id: t.variable,
                  label: `${t.variable} (${t.classification})`,
                  color: ['#35C99A', '#65B8D5', '#B58C5A', '#E8F2ED', '#A78BFA'][idx % 5],
                  values: normalize(t.values),
                }))}
              />
            )}
          </section>

          {/* MODULE B: OPPOSITE TREND DETECTOR */}
          <section className="space-y-4 pt-4 border-t border-[#9DB2A7]/15">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#E8F2ED]">Module B — Opposite Trend Detector</h2>
                <p className="text-xs text-[#9DB2A7]">
                  Compares identical environmental variables and units across {activeOpp?.region_a_name ?? 'Region A'} vs {activeOpp?.region_b_name ?? 'Region B'}.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {oppositeTrends.map((o, idx) => (
                  <button
                    key={o.variable}
                    onClick={() => setSelectedOppIdx(idx)}
                    className={`px-2.5 py-1 rounded text-xs font-mono ${
                      selectedOppIdx === idx
                        ? 'bg-[#35C99A]/20 text-[#35C99A] border border-[#35C99A]/40'
                        : 'bg-[#10251E] text-[#9DB2A7] border border-[#9DB2A7]/15'
                    }`}
                  >
                    {o.variable}
                  </button>
                ))}
              </div>
            </div>

            {activeOpp ? (
              <>
                <div className="p-4 rounded-xl bg-[#10251E] border border-[#9DB2A7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-semibold text-[#E8F2ED]">
                      Opposite Trends Detected:{' '}
                      <span className={activeOpp.opposite_trends_detected ? 'text-[#B58C5A]' : 'text-[#35C99A]'}>
                        {activeOpp.opposite_trends_detected ? 'YES — DIVERGENT REGIONAL TRENDS' : 'NO'}
                      </span>
                    </span>
                    <div className="text-[#9DB2A7] mt-0.5">{activeOpp.summary}</div>
                  </div>
                  <div className="font-mono text-[#65B8D5] shrink-0">
                    ΔSlope: {activeOpp.slope_difference} · Z={activeOpp.slope_diff_z} (p={activeOpp.slope_diff_p_value})
                  </div>
                </div>

                {/* 5 Opposite Trend Graph Tabs */}
                <div className="flex flex-wrap gap-2 bg-[#0B1C17] p-1.5 rounded-xl border border-[#9DB2A7]/15">
                  {(
                    [
                      { id: 'region_a', label: `Region A (${activeOpp.region_a_name})` },
                      { id: 'region_b', label: `Region B (${activeOpp.region_b_name})` },
                      { id: 'side_by_side', label: 'Side-by-Side Comparison' },
                      { id: 'combined', label: 'Combined Trend Graph' },
                      { id: 'difference', label: 'Regional Difference Graph' },
                    ] as { id: OppositeGraphTab; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setOppTab(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        oppTab === tab.id
                          ? 'bg-[#10251E] text-[#65B8D5] border border-[#65B8D5]/40'
                          : 'text-[#9DB2A7] hover:text-[#E8F2ED]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {oppTab === 'region_a' && (
                  <ScientificChart
                    title={`Region A Graph — ${activeOpp.region_a_name} (${activeOpp.variable})`}
                    xLabel="Date"
                    yLabel={activeOpp.variable}
                    unit={activeOpp.unit}
                    source="NASA POWER Regional Observation"
                    dateRange={`${activeOpp.region_a.start_date} to ${activeOpp.region_a.end_date}`}
                    dataNotes={`Classification: ${activeOpp.region_a.classification} (OLS slope ${activeOpp.region_a.ols.slope}, p=${activeOpp.region_a.ols.p_value})`}
                    labels={activeOpp.region_a.dates}
                    series={[
                      { id: 'ra', label: activeOpp.region_a_name, color: '#35C99A', values: activeOpp.region_a.values },
                      { id: 'ra_fit', label: 'OLS Fit', color: '#65B8D5', values: activeOpp.region_a.ols.fitted, dashed: true },
                    ]}
                  />
                )}

                {oppTab === 'region_b' && (
                  <ScientificChart
                    title={`Region B Graph — ${activeOpp.region_b_name} (${activeOpp.variable})`}
                    xLabel="Date"
                    yLabel={activeOpp.variable}
                    unit={activeOpp.unit}
                    source="NASA POWER Regional Observation"
                    dateRange={`${activeOpp.region_b.start_date} to ${activeOpp.region_b.end_date}`}
                    dataNotes={`Classification: ${activeOpp.region_b.classification} (OLS slope ${activeOpp.region_b.ols.slope}, p=${activeOpp.region_b.ols.p_value})`}
                    labels={activeOpp.region_b.dates}
                    series={[
                      { id: 'rb', label: activeOpp.region_b_name, color: '#B58C5A', values: activeOpp.region_b.values },
                      { id: 'rb_fit', label: 'OLS Fit', color: '#65B8D5', values: activeOpp.region_b.ols.fitted, dashed: true },
                    ]}
                  />
                )}

                {oppTab === 'side_by_side' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <ScientificChart
                      title={`Region A: ${activeOpp.region_a_name}`}
                      xLabel="Date"
                      yLabel={activeOpp.variable}
                      unit={activeOpp.unit}
                      source="NASA POWER"
                      dateRange={`${activeOpp.region_a.start_date} to ${activeOpp.region_a.end_date}`}
                      dataNotes={`Trend: ${activeOpp.region_a.classification} (slope ${activeOpp.region_a.ols.slope})`}
                      labels={activeOpp.region_a.dates}
                      series={[
                        { id: 'a', label: 'Observed', color: '#35C99A', values: activeOpp.region_a.values },
                        { id: 'af', label: 'OLS Trend', color: '#E8F2ED', values: activeOpp.region_a.ols.fitted, dashed: true },
                      ]}
                    />
                    <ScientificChart
                      title={`Region B: ${activeOpp.region_b_name}`}
                      xLabel="Date"
                      yLabel={activeOpp.variable}
                      unit={activeOpp.unit}
                      source="NASA POWER"
                      dateRange={`${activeOpp.region_b.start_date} to ${activeOpp.region_b.end_date}`}
                      dataNotes={`Trend: ${activeOpp.region_b.classification} (slope ${activeOpp.region_b.ols.slope})`}
                      labels={activeOpp.region_b.dates}
                      series={[
                        { id: 'b', label: 'Observed', color: '#B58C5A', values: activeOpp.region_b.values },
                        { id: 'bf', label: 'OLS Trend', color: '#E8F2ED', values: activeOpp.region_b.ols.fitted, dashed: true },
                      ]}
                    />
                  </div>
                )}

                {oppTab === 'combined' && (
                  <ScientificChart
                    title={`Combined Regional Trend Graph — ${activeOpp.variable}`}
                    xLabel="Date"
                    yLabel={activeOpp.variable}
                    unit={activeOpp.unit}
                    source="NASA POWER Comparable Regions"
                    dateRange={`${activeOpp.common_dates?.[0] ?? ''} to ${activeOpp.common_dates?.[activeOpp.common_dates.length - 1] ?? ''}`}
                    labels={activeOpp.region_a.dates}
                    series={[
                      { id: 'ca', label: `${activeOpp.region_a_name} (${activeOpp.region_a.classification})`, color: '#35C99A', values: activeOpp.region_a.values },
                      { id: 'cb', label: `${activeOpp.region_b_name} (${activeOpp.region_b.classification})`, color: '#B58C5A', values: activeOpp.region_b.values },
                    ]}
                  />
                )}

                {oppTab === 'difference' && (
                  <ScientificChart
                    title={`Regional Difference Graph (${activeOpp.region_a_name} minus ${activeOpp.region_b_name})`}
                    xLabel="Date"
                    yLabel={`Δ ${activeOpp.variable}`}
                    unit={activeOpp.unit}
                    source="Python Regional Difference Calculation"
                    dateRange={`${activeOpp.common_dates?.[0] ?? ''} to ${activeOpp.common_dates?.[activeOpp.common_dates.length - 1] ?? ''}`}
                    dataNotes={`Mean difference: ${activeOpp.mean_difference} ${activeOpp.unit}`}
                    labels={activeOpp.common_dates ?? []}
                    defaultChartType="bar"
                    referenceLines={[{ value: 0, label: 'Parity (0)', color: '#9DB2A7' }]}
                    series={[
                      {
                        id: 'diff',
                        label: 'Region A - Region B',
                        color: '#65B8D5',
                        values: activeOpp.difference_series ?? [],
                        type: 'bar',
                      },
                    ]}
                  />
                )}
              </>
            ) : (
              <div className="p-6 rounded-xl bg-[#10251E] border border-[#9DB2A7]/15 text-xs text-[#9DB2A7]">
                No compatible regional comparison pairs found for this investigation.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
