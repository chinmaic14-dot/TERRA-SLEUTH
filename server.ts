import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  createInvestigationRecord,
  getDashboardStats,
  getInvestigationById,
  getLatestAgentStatuses,
  getSolutionPlan,
  listInvestigations,
  upsertSolutionPlan,
} from './server/db.ts';
import {
  fetchElevation,
  fetchLiveWeatherAndForecast,
  fetchModisNdviSeries,
  fetchNasaEonetAndFirms,
  fetchNasaPowerSeries,
  fetchSoilGridsBaseline,
  geocodeLocation,
  getNasaGibsLayers,
  searchNasaCmrDatasets,
} from './server/envData.ts';
import {
  cancelInvestigationRun,
  extractAgentOutputs,
  runInvestigationPipeline,
} from './server/pipeline.ts';
import { generateActionPlanPdf, generateScientificReportPdf } from './server/pdf.ts';
import {
  answerVoiceAssistantQuery,
  synthesizeSpeechWavWithGemini,
  transcribeAudioWithGemini,
  translateBatchWithGemini,
  translateTextWithGemini,
} from './server/gemini.ts';
import { compareBeforeAfterOutcome, getOrBuildSolutionWorkspace } from './server/solutions.ts';
import { ENVIRONMENTAL_VARIABLES } from './server/types.ts';

const PORT = Number(process.env.PORT ?? 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // -------------------------------------------------------------------------
  // Health & Overview Dashboard Telemetry (Real DB + Live Env Indicators)
  // -------------------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    const mapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      status: 'ok',
      service: 'TERRA SLEUTH',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      firmsKeyConfigured: Boolean(process.env.NASA_FIRMS_MAP_KEY),
      earthdataTokenConfigured: Boolean(process.env.NASA_EARTHDATA_TOKEN),
      googleMapsConfigured: Boolean(mapsKey && mapsKey.trim().length > 5),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/maps/config', (_req, res) => {
    const apiKey = (process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '').trim();
    res.json({
      configured: apiKey.length > 5,
      apiKey,
    });
  });

  app.get('/api/dashboard', async (req, res) => {
    try {
      const lat = Number(req.query.lat ?? 12.9719);
      const lon = Number(req.query.lon ?? 77.5937);
      const stats = getDashboardStats();
      const recentInvestigations = listInvestigations().slice(0, 8);
      const agentStatuses = getLatestAgentStatuses();

      const endDate = new Date().toISOString().slice(0, 10);
      const startDate = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
      const [weather, powerRecent, hazards] = await Promise.all([
        fetchLiveWeatherAndForecast(lat, lon),
        fetchNasaPowerSeries(lat, lon, startDate, endDate, ['PRECTOTCORR', 'GWETTOP', 'TS', 'T2M']),
        fetchNasaEonetAndFirms(lat, lon),
      ]);

      const latestPowerVal = (code: string) => {
        const vals = powerRecent.series?.[code]?.values ?? [];
        for (let i = vals.length - 1; i >= 0; i--) {
          if (vals[i] !== null && vals[i] !== undefined) {
            return { value: vals[i], date: powerRecent.dates[i], unit: powerRecent.series[code].unit };
          }
        }
        return null;
      };

      res.json({
        stats,
        recentInvestigations,
        agentStatuses,
        liveIndicators: {
          location: { lat, lon },
          weather,
          powerRecent: {
            available: powerRecent.available,
            source: powerRecent.source,
            freshnessStatus: powerRecent.freshnessStatus,
            retrievedAt: powerRecent.retrievedAt,
            soilWetness: latestPowerVal('GWETTOP'),
            landSurfaceTemp: latestPowerVal('TS'),
            precipitation: latestPowerVal('PRECTOTCORR'),
          },
          activeFireEventsCount: hazards.nearbyEvents?.length ?? 0,
          firmsActive: hazards.firms?.available ?? false,
          nearbyEvents: hazards.nearbyEvents?.slice(0, 5) ?? [],
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // Live Earth Monitor & Geospatial Endpoints
  // -------------------------------------------------------------------------
  app.get('/api/geo/search', async (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (!q) return res.json({ results: [] });
      const results = await geocodeLocation(q);
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/live-earth', async (req, res) => {
    try {
      const lat = Number(req.query.lat ?? 12.9719);
      const lon = Number(req.query.lon ?? 77.5937);
      const days = Math.min(365, Math.max(14, Number(req.query.days ?? 90)));
      const endDate = new Date().toISOString().slice(0, 10);
      const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const modisStart = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

      const [elevationM, weather, power, soilGrids, modisNdvi, hazards] = await Promise.all([
        fetchElevation(lat, lon),
        fetchLiveWeatherAndForecast(lat, lon),
        fetchNasaPowerSeries(lat, lon, startDate, endDate, ['PRECTOTCORR', 'T2M', 'TS', 'GWETTOP', 'GWETROOT', 'RH2M', 'ALLSKY_SFC_SW_DWN']),
        fetchSoilGridsBaseline(lat, lon),
        fetchModisNdviSeries(lat, lon, modisStart, endDate),
        fetchNasaEonetAndFirms(lat, lon),
      ]);

      res.json({
        coordinates: { lat, lon, elevationM },
        retrievedAt: new Date().toISOString(),
        weather,
        power,
        soilGrids,
        modisNdvi,
        hazards,
        gibsLayers: getNasaGibsLayers(req.query.layerDate ? String(req.query.layerDate) : undefined),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // Data Availability Pre-Check & Variable Catalog
  // -------------------------------------------------------------------------
  app.get('/api/catalog/variables', (_req, res) => {
    res.json({ variables: ENVIRONMENTAL_VARIABLES });
  });

  app.post('/api/investigations/check-availability', async (req, res) => {
    try {
      const { latitude, longitude, startDate, endDate, variables, category } = req.body;
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
      }
      const vars: string[] = Array.isArray(variables) && variables.length > 0 ? variables : ['PRECTOTCORR', 'GWETTOP', 'T2M'];
      const [cmr, powerProbe, modisProbe, elev] = await Promise.all([
        searchNasaCmrDatasets([category || 'soil', 'GPM', 'SMAP', 'MODIS']),
        fetchNasaPowerSeries(lat, lon, startDate, endDate, vars.slice(0, 3)),
        vars.includes('NDVI') ? fetchModisNdviSeries(lat, lon, startDate, endDate) : Promise.resolve(null),
        fetchElevation(lat, lon),
      ]);

      const availableSources = [];
      const missingSources = [];
      if (powerProbe.available) {
        availableSources.push({
          service: 'NASA POWER (GPM / MERRA-2 / GEOS-5)',
          period: `${powerProbe.dates[0]} to ${powerProbe.dates[powerProbe.dates.length - 1]}`,
          points: powerProbe.dates.length,
          freshness: powerProbe.freshnessStatus,
        });
      } else {
        missingSources.push({ service: 'NASA POWER', reason: powerProbe.error ?? 'No records' });
      }

      if (vars.includes('NDVI')) {
        if (modisProbe?.available) {
          availableSources.push({
            service: 'NASA Terra MODIS MOD13Q1 (ORNL DAAC)',
            period: `${modisProbe.dates[0]} to ${modisProbe.dates[modisProbe.dates.length - 1]}`,
            points: modisProbe.dates.length,
            freshness: modisProbe.freshnessStatus,
          });
        } else {
          missingSources.push({ service: 'ORNL MODIS MOD13Q1', reason: modisProbe?.error ?? 'Unavailable for date window' });
        }
      }

      res.json({
        elevationM: elev,
        cmrDatasets: cmr.entries ?? [],
        availableSources,
        missingSources,
        limitations: [
          'NASA POWER variables represent 0.5° × 0.625° (~55 km) gridded satellite/reanalysis estimates, not point farm sensors.',
          'Satellite observations have 2–10 day publication latency and are never labeled as live telemetry.',
          !process.env.NASA_FIRMS_MAP_KEY ? 'NASA_FIRMS_MAP_KEY not set; NRT fire detection uses NASA EONET + GIBS VIIRS layers.' : null,
        ].filter(Boolean),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // Investigations CRUD, 8-Agent Execution, Cancel & Retry
  // -------------------------------------------------------------------------
  app.get('/api/investigations', (_req, res) => {
    res.json({ investigations: listInvestigations() });
  });

  app.post('/api/investigations', async (req, res) => {
    try {
      const b = req.body;
      if (!b.researchQuestion || !Number.isFinite(Number(b.latitude)) || !Number.isFinite(Number(b.longitude))) {
        return res.status(400).json({ error: 'researchQuestion, latitude, and longitude are required.' });
      }
      const id = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const record = createInvestigationRecord({
        id,
        research_question: String(b.researchQuestion).trim(),
        category: String(b.category || 'Water'),
        country: String(b.country || ''),
        state: String(b.state || ''),
        district: String(b.district || ''),
        region_name: String(b.regionName || b.district || b.state || 'Study Region'),
        latitude: Number(b.latitude),
        longitude: Number(b.longitude),
        elevation_m: null,
        comparison_region_name: b.comparisonRegionName ? String(b.comparisonRegionName) : null,
        comparison_lat: b.comparisonLat != null && b.comparisonLat !== '' ? Number(b.comparisonLat) : null,
        comparison_lon: b.comparisonLon != null && b.comparisonLon !== '' ? Number(b.comparisonLon) : null,
        comparison_elevation_m: null,
        start_date: String(b.startDate || '2022-01-01'),
        end_date: String(b.endDate || new Date().toISOString().slice(0, 10)),
        variables_json: JSON.stringify(
          Array.isArray(b.variables) && b.variables.length > 0
            ? b.variables
            : ['PRECTOTCORR', 'GWETTOP', 'GWETROOT', 'T2M', 'TS', 'NDVI']
        ),
        status: 'running',
        progress_pct: 2,
        current_agent: 'Initializing',
        verdict: null,
        summary: null,
      });

      // Execute 8-agent pipeline asynchronously
      void runInvestigationPipeline(record.id);

      res.status(201).json({ investigation: record });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/investigations/:id', (req, res) => {
    const inv = getInvestigationById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Investigation not found' });
    const { runs, outputs } = extractAgentOutputs(inv.id);
    res.json({ investigation: inv, agentRuns: runs, outputs });
  });

  app.post('/api/investigations/:id/cancel', (req, res) => {
    const inv = getInvestigationById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Investigation not found' });
    cancelInvestigationRun(inv.id);
    res.json({ ok: true });
  });

  app.post('/api/investigations/:id/retry', (req, res) => {
    const inv = getInvestigationById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Investigation not found' });
    void runInvestigationPipeline(inv.id);
    res.json({ ok: true, status: 'running' });
  });

  // -------------------------------------------------------------------------
  // Solution Centre Endpoints
  // -------------------------------------------------------------------------
  app.get('/api/solutions/:investigationId', async (req, res) => {
    try {
      const userType = req.query.userType ? String(req.query.userType) : undefined;
      const domain = req.query.domain ? String(req.query.domain) : undefined;
      const budgetInr = Number(req.query.budgetInr ?? 50000);
      const refresh = req.query.refresh === 'true';
      const recalculate = req.query.recalculate === 'true';
      const data = await getOrBuildSolutionWorkspace(
        req.params.investigationId,
        userType,
        budgetInr,
        refresh,
        recalculate,
        domain
      );
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/api/solutions/:investigationId', (req, res) => {
    try {
      const existing = getSolutionPlan(req.params.investigationId);
      if (!existing && !getInvestigationById(req.params.investigationId)) {
        return res.status(404).json({ error: 'Investigation not found' });
      }
      const { userType, budgetInr, selectedSolutionId, checklist, tracker, outcomeNotes } = req.body;
      const updated = upsertSolutionPlan(req.params.investigationId, {
        ...(userType !== undefined ? { user_type: userType } : {}),
        ...(budgetInr !== undefined ? { budget_inr: Number(budgetInr) } : {}),
        ...(selectedSolutionId !== undefined ? { selected_solution_id: selectedSolutionId } : {}),
        ...(checklist !== undefined ? { checklist_json: JSON.stringify(checklist) } : {}),
        ...(tracker !== undefined ? { tracker_json: JSON.stringify(tracker) } : {}),
        ...(outcomeNotes !== undefined ? { outcome_notes: outcomeNotes } : {}),
      });
      res.json({ ok: true, plan: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/solutions/:investigationId/outcome-monitor', async (req, res) => {
    try {
      const interventionDate = String(req.body.interventionDate ?? new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
      const domain = req.body.domain ? String(req.body.domain) : undefined;
      const result = await compareBeforeAfterOutcome(req.params.investigationId, interventionDate, domain);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // Multilingual Voice Assistant, Translation, TTS & Transcription Endpoints
  // -------------------------------------------------------------------------
  app.post('/api/assistant/ask', async (req, res) => {
    try {
      const { question, languageName, activePage, investigationSummary, pageContextText } = req.body ?? {};
      if (!question || !String(question).trim()) {
        return res.status(400).json({ error: 'Question is required.' });
      }
      const result = await answerVoiceAssistantQuery({
        question: String(question),
        languageName: String(languageName || 'English'),
        activePage: String(activePage || 'Home'),
        investigationSummary: investigationSummary ? String(investigationSummary) : undefined,
        pageContextText: pageContextText ? String(pageContextText) : undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/assistant/translate', async (req, res) => {
    try {
      const { text, languageName } = req.body ?? {};
      if (!text) return res.json({ ok: true, translatedText: '' });
      const result = await translateTextWithGemini({
        text: String(text),
        languageName: String(languageName || 'English'),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/assistant/translate-batch', async (req, res) => {
    try {
      const { texts, languageCode, languageName } = req.body ?? {};
      if (!Array.isArray(texts)) {
        return res.status(400).json({ error: 'texts array is required.' });
      }
      const result = await translateBatchWithGemini({
        texts: texts.slice(0, 200).map((t: unknown) => String(t ?? '')),
        languageCode: String(languageCode || 'en'),
        languageName: String(languageName || 'English'),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/assistant/tts', async (req, res) => {
    try {
      const { text, languageName } = req.body ?? {};
      if (!text || !String(text).trim()) {
        return res.status(400).json({ error: 'Text is required for speech synthesis.' });
      }
      const result = await synthesizeSpeechWavWithGemini({
        text: String(text),
        languageName: String(languageName || 'English'),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/assistant/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, languageName } = req.body ?? {};
      if (!audioBase64) {
        return res.status(400).json({ error: 'audioBase64 is required.' });
      }
      const result = await transcribeAudioWithGemini({
        audioBase64: String(audioBase64),
        mimeType: String(mimeType || 'audio/webm'),
        languageName: String(languageName || 'English'),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // Scientific Reports & Environmental Action Plan PDF Downloads
  // -------------------------------------------------------------------------
  app.get('/api/investigations/:id/pdf/scientific', async (req, res) => {
    try {
      const lang = String(req.query.lang ?? 'en');
      const langName = String(req.query.langName ?? 'English');
      const pdfBuf = await generateScientificReportPdf(req.params.id, lang, langName);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="TERRA_SLEUTH_Scientific_Report_${req.params.id}_${lang}.pdf"`);
      res.send(pdfBuf);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/investigations/:id/pdf/action-plan', async (req, res) => {
    try {
      const lang = String(req.query.lang ?? 'en');
      const langName = String(req.query.langName ?? 'English');
      const pdfBuf = await generateActionPlanPdf(req.params.id, lang, langName);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="TERRA_SLEUTH_Action_Plan_${req.params.id}_${lang}.pdf"`);
      res.send(pdfBuf);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // Vite Dev Middleware or Static Production Build
  // -------------------------------------------------------------------------
  const distPath = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TERRA SLEUTH server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TERRA SLEUTH server:', err);
  process.exit(1);
});
