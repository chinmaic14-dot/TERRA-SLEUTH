import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Play, RotateCcw, Search, Square, XCircle } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { AgentRunSummary, InvestigationSummary, PageId } from '../types/terra';

interface WorkspacePageProps {
  activeInvestigation: InvestigationSummary | null;
  agentRuns: AgentRunSummary[];
  onInvestigationCreated: (id: string) => void;
  onRefreshActive: () => Promise<void>;
  onNavigate: (page: PageId) => void;
}

const CATEGORIES = [
  'Water',
  'Agriculture',
  'Soil',
  'Forest',
  'Vegetation',
  'Climate',
  'Temperature',
  'Rainfall',
  'Drought',
  'Fire',
  'Land cover',
  'Coastal environment',
  'Other environmental concerns',
];

const AVAILABLE_VARS = [
  { code: 'PRECTOTCORR', label: 'Precipitation (GPM / MERRA-2)' },
  { code: 'GWETTOP', label: 'Surface Soil Wetness (SMAP / GEOS-5)' },
  { code: 'GWETROOT', label: 'Root-Zone Soil Wetness' },
  { code: 'T2M', label: '2m Air Temperature (MERRA-2)' },
  { code: 'TS', label: 'Land Surface Temperature' },
  { code: 'NDVI', label: 'MODIS 250m Vegetation (NDVI)' },
  { code: 'RH2M', label: 'Relative Humidity' },
  { code: 'ALLSKY_SFC_SW_DWN', label: 'CERES Solar Irradiance' },
  { code: 'EVPTRNS', label: 'Evapotranspiration Flux' },
];

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  activeInvestigation,
  agentRuns,
  onInvestigationCreated,
  onRefreshActive,
  onNavigate,
}) => {
  const [researchQuestion, setResearchQuestion] = useState(
    'How have soil moisture, rainfall variability, and land surface temperature changed in Raichur District since 2022?'
  );
  const [category, setCategory] = useState('Drought');
  const [country, setCountry] = useState('India');
  const [state, setState] = useState('Karnataka');
  const [district, setDistrict] = useState('Raichur');
  const [regionName, setRegionName] = useState('Raichur Basin');
  const [latitude, setLatitude] = useState('16.2076');
  const [longitude, setLongitude] = useState('77.3463');

  const [compRegionName, setCompRegionName] = useState('Shivamogga (Malnad)');
  const [compLat, setCompLat] = useState('13.9299');
  const [compLon, setCompLon] = useState('75.5681');

  const [startDate, setStartDate] = useState('2022-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [variables, setVariables] = useState<string[]>([
    'PRECTOTCORR',
    'GWETTOP',
    'GWETROOT',
    'T2M',
    'TS',
    'NDVI',
  ]);

  const [geoQuery, setGeoQuery] = useState('');
  const [geoMatches, setGeoMatches] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(null);
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll active investigation while running
  useEffect(() => {
    if (!activeInvestigation || activeInvestigation.status !== 'running') return;
    const timer = setInterval(() => {
      void onRefreshActive();
    }, 2500);
    return () => clearInterval(timer);
  }, [activeInvestigation?.id, activeInvestigation?.status]);

  const toggleVar = (code: string) => {
    setVariables((prev) =>
      prev.includes(code) ? (prev.length > 1 ? prev.filter((v) => v !== code) : prev) : [...prev, code]
    );
  };

  const handleGeocode = async () => {
    if (!geoQuery.trim()) return;
    const res = await fetch(`/api/geo/search?q=${encodeURIComponent(geoQuery)}`);
    const json = await res.json();
    setGeoMatches(json.results ?? []);
  };

  const handleCheckAvailability = async () => {
    setCheckingAvail(true);
    setError(null);
    try {
      const res = await fetch('/api/investigations/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: Number(latitude),
          longitude: Number(longitude),
          startDate,
          endDate,
          variables,
          category,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Availability check failed');
      setAvailability(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingAvail(false);
    }
  };

  const handleStartInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          researchQuestion,
          category,
          country,
          state,
          district,
          regionName,
          latitude: Number(latitude),
          longitude: Number(longitude),
          comparisonRegionName: compRegionName || null,
          comparisonLat: compLat ? Number(compLat) : null,
          comparisonLon: compLon ? Number(compLon) : null,
          startDate,
          endDate,
          variables,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start investigation');
      onInvestigationCreated(json.investigation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeInvestigation) return;
    await fetch(`/api/investigations/${activeInvestigation.id}/cancel`, { method: 'POST' });
    await onRefreshActive();
  };

  const handleRetry = async () => {
    if (!activeInvestigation) return;
    await fetch(`/api/investigations/${activeInvestigation.id}/retry`, { method: 'POST' });
    await onRefreshActive();
  };

  const applyPreset = (preset: 'raichur' | 'cauvery' | 'california') => {
    if (preset === 'raichur') {
      setResearchQuestion('How have soil moisture, rainfall variability, and land surface temperature changed in Raichur District since 2022?');
      setCategory('Drought');
      setCountry('India');
      setState('Karnataka');
      setDistrict('Raichur');
      setRegionName('Raichur Basin');
      setLatitude('16.2076');
      setLongitude('77.3463');
      setCompRegionName('Shivamogga (Malnad)');
      setCompLat('13.9299');
      setCompLon('75.5681');
      setStartDate('2022-01-01');
    } else if (preset === 'cauvery') {
      setResearchQuestion('Are vegetation indices and root-zone soil wetness diverging between Mandya irrigated plains and Chamarajanagar dryland?');
      setCategory('Agriculture');
      setCountry('India');
      setState('Karnataka');
      setDistrict('Mandya');
      setRegionName('Mandya Cauvery Basin');
      setLatitude('12.5218');
      setLongitude('76.8951');
      setCompRegionName('Chamarajanagar');
      setCompLat('11.9261');
      setCompLon('76.9437');
      setStartDate('2021-06-01');
    } else {
      setResearchQuestion('How are land surface temperature, relative humidity, and vegetation cover shifting in Northern California wildfire corridors?');
      setCategory('Fire');
      setCountry('United States');
      setState('California');
      setDistrict('Butte County');
      setRegionName('Paradise / Butte');
      setLatitude('39.7596');
      setLongitude('-121.6219');
      setCompRegionName('Humboldt Coast');
      setCompLat('40.8021');
      setCompLon('-124.1637');
      setStartDate('2021-01-01');
    }
    setAvailability(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investigation Workspace"
        description="Define a scientific environmental research question, verify NASA dataset coverage before execution, and orchestrate all eight autonomous agents."
        contextLine="Pipeline: Data Scout → Trend Detective → Geo Intelligence → Relationship Analyst → Cause Investigator → Science Challenger → Impact Analyst → Earth Judge"
        actions={
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => applyPreset('raichur')}
              className="px-3 py-1.5 rounded-lg bg-[#10251E] border border-[#9DB2A7]/20 text-[#9DB2A7] hover:text-[#E8F2ED]"
            >
              Preset: Raichur Drought
            </button>
            <button
              type="button"
              onClick={() => applyPreset('cauvery')}
              className="px-3 py-1.5 rounded-lg bg-[#10251E] border border-[#9DB2A7]/20 text-[#9DB2A7] hover:text-[#E8F2ED]"
            >
              Preset: Cauvery vs Dryland
            </button>
            <button
              type="button"
              onClick={() => applyPreset('california')}
              className="px-3 py-1.5 rounded-lg bg-[#10251E] border border-[#9DB2A7]/20 text-[#9DB2A7] hover:text-[#E8F2ED]"
            >
              Preset: California Fire Risk
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Investigation Configuration Form */}
        <form onSubmit={handleStartInvestigation} className="xl:col-span-7 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#E8F2ED]">Scientific Research Question</label>
            <textarea
              rows={2}
              required
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 p-3 text-sm text-[#E8F2ED] focus:outline-none focus:border-[#35C99A]"
            />
          </div>

          {/* Location Lookup Helper */}
          <div className="p-3.5 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/15 space-y-2.5">
            <div className="text-xs font-medium text-[#65B8D5]">Coordinate Lookup (Open-Meteo Geocoding)</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={geoQuery}
                onChange={(e) => setGeoQuery(e.target.value)}
                placeholder="Type city, district, or watershed to auto-fill coordinates..."
                className="flex-1 rounded-lg bg-[#10251E] border border-[#9DB2A7]/20 px-3 py-1.5 text-xs text-[#E8F2ED] focus:outline-none focus:border-[#35C99A]"
              />
              <button
                type="button"
                onClick={handleGeocode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10251E] border border-[#9DB2A7]/25 text-xs text-[#E8F2ED] hover:border-[#35C99A]"
              >
                <Search className="w-3.5 h-3.5" /> Lookup
              </button>
            </div>
            {geoMatches.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {geoMatches.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setCountry(m.country || '');
                      setState(m.state || '');
                      setDistrict(m.district || m.name);
                      setRegionName(m.name);
                      setLatitude(String(m.latitude));
                      setLongitude(String(m.longitude));
                      setGeoMatches([]);
                    }}
                    className="px-2.5 py-1 rounded bg-[#10251E] border border-[#35C99A]/30 text-[11px] text-[#E8F2ED]"
                  >
                    {m.name}, {m.state} ({m.latitude.toFixed(2)}°, {m.longitude.toFixed(2)}°)
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div>
              <label className="block text-[#9DB2A7] mb-1">Environmental Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 text-[#E8F2ED]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 text-[#E8F2ED]"
              />
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">State / Province</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 text-[#E8F2ED]"
              />
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">District / Region</label>
              <input
                type="text"
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setRegionName(e.target.value);
                }}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 text-[#E8F2ED]"
              />
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">Latitude</label>
              <input
                type="number"
                step="0.0001"
                required
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 font-mono text-[#E8F2ED]"
              />
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">Longitude</label>
              <input
                type="number"
                step="0.0001"
                required
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 font-mono text-[#E8F2ED]"
              />
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 font-mono text-[#E8F2ED]"
              />
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">End Date</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 font-mono text-[#E8F2ED]"
              />
            </div>
          </div>

          {/* Comparison Region for Opposite Trend Detector */}
          <div className="p-3.5 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/15 space-y-2.5 text-xs">
            <div className="font-medium text-[#E8F2ED]">Comparison Region (For Opposite Trend Detector)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                placeholder="Comparison region name"
                value={compRegionName}
                onChange={(e) => setCompRegionName(e.target.value)}
                className="rounded-lg bg-[#10251E] border border-[#9DB2A7]/20 px-3 py-2 text-[#E8F2ED]"
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Comp. Latitude"
                value={compLat}
                onChange={(e) => setCompLat(e.target.value)}
                className="rounded-lg bg-[#10251E] border border-[#9DB2A7]/20 px-3 py-2 font-mono text-[#E8F2ED]"
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Comp. Longitude"
                value={compLon}
                onChange={(e) => setCompLon(e.target.value)}
                className="rounded-lg bg-[#10251E] border border-[#9DB2A7]/20 px-3 py-2 font-mono text-[#E8F2ED]"
              />
            </div>
          </div>

          {/* Variable Multi-Select */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[#E8F2ED]">Environmental Variables (Select 2+ for Relationships)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AVAILABLE_VARS.map((v) => {
                const active = variables.includes(v.code);
                return (
                  <button
                    key={v.code}
                    type="button"
                    onClick={() => toggleVar(v.code)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      active
                        ? 'bg-[#35C99A]/15 border-[#35C99A]/50 text-[#E8F2ED]'
                        : 'bg-[#0B1C17] border-[#9DB2A7]/15 text-[#9DB2A7]'
                    }`}
                  >
                    <span className="font-mono text-[#35C99A]">{v.code}</span> · {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleCheckAvailability}
              disabled={checkingAvail}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B1C17] border border-[#65B8D5]/40 text-xs font-medium text-[#65B8D5] hover:bg-[#65B8D5]/10"
            >
              {checkingAvail && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Check Data Availability
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#35C99A] text-[#07120F] text-xs font-bold tracking-wide hover:bg-[#2eb58a] disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              START SCIENTIFIC INVESTIGATION
            </button>
          </div>
        </form>

        {/* Right: Data Availability Check + Live 8-Agent Execution Monitor */}
        <div className="xl:col-span-5 space-y-5">
          {/* Pre-Check Results */}
          <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-[#E8F2ED]">Data Availability Pre-Check</h2>
            {!availability ? (
              <p className="text-xs text-[#9DB2A7]">
                Click &ldquo;Check Data Availability&rdquo; to probe NASA CMR collections, NASA POWER coverage, MODIS MOD13Q1 granules, and surface elevation before launching the 8-agent pipeline.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="font-mono text-[#65B8D5]">
                  Target Elevation: {availability.elevationM ?? 'Unavailable'} m
                </div>
                <div className="space-y-1.5">
                  <div className="font-medium text-[#35C99A]">Available Sources</div>
                  {(availability.availableSources ?? []).map((s: any, idx: number) => (
                    <div key={idx} className="p-2 rounded bg-[#0B1C17] border border-[#9DB2A7]/10">
                      <div className="text-[#E8F2ED]">{s.service}</div>
                      <div className="font-mono text-[11px] text-[#9DB2A7]">
                        {s.period} · {s.points} points · {s.freshness}
                      </div>
                    </div>
                  ))}
                </div>
                {(availability.missingSources ?? []).length > 0 && (
                  <div className="space-y-1">
                    <div className="font-medium text-amber-400">Missing / Unavailable Sources</div>
                    {availability.missingSources.map((m: any, idx: number) => (
                      <div key={idx} className="text-[#9DB2A7]">{m.service}: {m.reason}</div>
                    ))}
                  </div>
                )}
                <div className="space-y-1">
                  <div className="font-medium text-[#E8F2ED]">Expected Analysis Limitations</div>
                  <ul className="list-disc pl-4 text-[#9DB2A7] space-y-0.5">
                    {(availability.limitations ?? []).map((l: string, i: number) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Live 8-Agent Execution Progress */}
          <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#E8F2ED]">Execution Monitor</h2>
                {activeInvestigation && (
                  <p className="text-xs font-mono text-[#9DB2A7]">
                    {activeInvestigation.region_name} · {activeInvestigation.status} ({activeInvestigation.progress_pct}%)
                  </p>
                )}
              </div>
              {activeInvestigation && (
                <div className="flex items-center gap-2">
                  {activeInvestigation.status === 'running' && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300"
                    >
                      <Square className="w-3 h-3" /> Cancel
                    </button>
                  )}
                  {(activeInvestigation.status === 'error' || activeInvestigation.status === 'cancelled') && (
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0B1C17] border border-[#35C99A]/40 text-xs text-[#35C99A]"
                    >
                      <RotateCcw className="w-3 h-3" /> Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            {activeInvestigation ? (
              <>
                <div className="w-full h-2 rounded-full bg-[#0B1C17] overflow-hidden">
                  <div
                    className="h-full bg-[#35C99A] transition-all duration-300"
                    style={{ width: `${activeInvestigation.progress_pct}%` }}
                  />
                </div>
                <div className="divide-y divide-[#9DB2A7]/10">
                  {agentRuns.map((run) => (
                    <div key={run.id} className="py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {run.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-[#35C99A]" />}
                        {run.status === 'running' && <Loader2 className="w-3.5 h-3.5 text-[#65B8D5] animate-spin" />}
                        {(run.status === 'error' || run.status === 'cancelled') && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                        {run.status === 'pending' && <span className="w-3.5 h-3.5 inline-block text-center text-[#9DB2A7]">◌</span>}
                        <span className="text-[#E8F2ED]">{run.agent_name}</span>
                      </div>
                      <span className="font-mono text-[#9DB2A7]">
                        {run.status === 'completed' ? `${run.findings_count} items` : run.status}
                      </span>
                    </div>
                  ))}
                </div>
                {activeInvestigation.status === 'completed' && (
                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate('earth-judge')}
                      className="px-3.5 py-2 rounded-lg bg-[#35C99A] text-[#07120F] text-xs font-semibold"
                    >
                      View Earth Judge Verdict
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('trend-detective')}
                      className="px-3.5 py-2 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/25 text-xs text-[#E8F2ED]"
                    >
                      Inspect Trends &amp; Graphs
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-[#9DB2A7]">
                No investigation running. Configure parameters on the left and click START SCIENTIFIC INVESTIGATION.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
