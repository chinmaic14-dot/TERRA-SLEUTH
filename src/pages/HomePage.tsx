import React, { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, FlaskConical, Globe, RefreshCw } from 'lucide-react';
import earthHeroImg from '../assets/images/earth_observation_hero_1794750933285.jpg';
import { AgentRunSummary, InvestigationSummary, PageId } from '../types/terra';

interface HomePageProps {
  onNavigate: (page: PageId) => void;
  onSelectInvestigation: (id: string, targetPage?: PageId) => void;
  activeInvestigation: InvestigationSummary | null;
}

const AGENT_PAGE_MAP: Record<string, PageId> = {
  data_scout: 'data-scout',
  trend_detective: 'trend-detective',
  geo_intelligence: 'geo-intelligence',
  relationship_analyst: 'relationship-analyst',
  cause_investigator: 'cause-investigator',
  science_challenger: 'science-challenger',
  impact_analyst: 'impact-analyst',
  earth_judge: 'earth-judge',
};

const AGENT_LABELS: { key: string; name: string }[] = [
  { key: 'data_scout', name: 'Data Scout' },
  { key: 'trend_detective', name: 'Trend Detective' },
  { key: 'geo_intelligence', name: 'Geo Intelligence' },
  { key: 'relationship_analyst', name: 'Relationship Analyst' },
  { key: 'cause_investigator', name: 'Cause Investigator' },
  { key: 'science_challenger', name: 'Science Challenger' },
  { key: 'impact_analyst', name: 'Impact Analyst' },
  { key: 'earth_judge', name: 'Earth Judge' },
];

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  onSelectInvestigation,
  activeInvestigation,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const lat = activeInvestigation?.latitude ?? 12.9719;
      const lon = activeInvestigation?.longitude ?? 77.5937;
      const res = await fetch(`/api/dashboard?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [activeInvestigation?.id]);

  const stats = data?.stats ?? {
    totalInvestigations: 0,
    activeInvestigations: 0,
    completedInvestigations: 0,
    concernsDetected: 0,
    regionsMonitored: 0,
  };
  const recent: InvestigationSummary[] = data?.recentInvestigations ?? [];
  const agentStatuses: Record<string, AgentRunSummary | null> = data?.agentStatuses ?? {};
  const live = data?.liveIndicators;
  const weather = live?.weather;
  const power = live?.powerRecent;
  const locLabel = activeInvestigation
    ? `${activeInvestigation.region_name} (${activeInvestigation.latitude.toFixed(2)}°, ${activeInvestigation.longitude.toFixed(2)}°)`
    : 'Bengaluru Reference Station (12.97°, 77.59°)';

  return (
    <div className="space-y-8">
      {/* Main Hero Section */}
      <section className="relative rounded-2xl overflow-hidden border border-[#9DB2A7]/20 bg-[#0B1C17]">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6 relative z-10">
            <div className="space-y-4">
              <div className="text-xs font-mono tracking-widest text-[#35C99A]">
                DETECT. INVESTIGATE. VERIFY. RESTORE.
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#E8F2ED] text-balance">
                TERRA SLEUTH
              </h1>
              <p className="text-sm sm:text-base text-[#9DB2A7] max-w-2xl leading-relaxed">
                An autonomous environmental intelligence platform that investigates Earth&apos;s changing systems using satellite observations, Python statistical verification, and eight-agent scientific synthesis.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => onNavigate('workspace')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#35C99A] text-[#07120F] text-sm font-semibold hover:bg-[#2eb58a] transition-colors whitespace-nowrap"
                >
                  <FlaskConical className="w-4 h-4" />
                  Start Investigation
                </button>
                <button
                  onClick={() => onNavigate('live-earth')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#10251E] border border-[#9DB2A7]/25 text-[#E8F2ED] text-sm font-medium hover:border-[#65B8D5]/60 transition-colors whitespace-nowrap"
                >
                  <Globe className="w-4 h-4 text-[#65B8D5]" />
                  Explore Live Earth
                </button>
              </div>
            </div>

            {/* Latest Investigation Summary or System Readiness */}
            <div className="pt-4 border-t border-[#9DB2A7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              {recent[0] ? (
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[#9DB2A7] font-mono">
                    Latest Investigation · {recent[0].region_name} · {recent[0].verdict ?? recent[0].status}
                  </div>
                  <div className="text-[#E8F2ED] truncate">{recent[0].research_question}</div>
                </div>
              ) : (
                <div className="text-[#9DB2A7] font-mono">
                  System Ready · NASA POWER, CMR, GIBS, MODIS &amp; Open-Meteo connected
                </div>
              )}
              {recent[0] && (
                <button
                  onClick={() => onSelectInvestigation(recent[0].id, 'earth-judge')}
                  className="inline-flex items-center gap-1.5 text-[#35C99A] hover:underline whitespace-nowrap shrink-0 font-medium"
                >
                  Open Verdict <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Earth Observation Visual */}
          <div className="lg:col-span-5 relative min-h-[240px] lg:min-h-[340px] bg-[#07120F]">
            {!heroImgFailed ? (
              <img
                src={earthHeroImg}
                alt="Orbital satellite view of Earth limb at dawn showing biosphere and atmospheric horizon"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover lg:absolute lg:inset-0"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#0B1C17] to-[#07120F] text-center">
                <Globe className="w-12 h-12 text-[#35C99A]/70 mb-2" />
                <div className="text-xs font-mono text-[#9DB2A7]">Orbital Earth Observation Telemetry</div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B1C17] via-[#0B1C17]/30 to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Environmental Overview (Real Live & Satellite Indicators) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[#E8F2ED]">Current Environmental Overview</h2>
            <p className="text-xs text-[#9DB2A7]">
              Monitored coordinates: <span className="font-mono text-[#65B8D5]">{locLabel}</span>
            </p>
          </div>
          <button
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10251E] border border-[#9DB2A7]/20 text-xs text-[#9DB2A7] hover:text-[#E8F2ED] self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Observations
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-[#10251E] border border-rose-500/40 text-xs text-rose-300">
            Environmental telemetry fetch error: {error}. No fabricated fallback values are shown.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Current Temperature & Weather */}
          <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-2">
            <div className="text-xs text-[#9DB2A7]">Current Temperature</div>
            <div className="text-2xl font-mono font-semibold text-[#E8F2ED] tabular-nums">
              {weather?.available && weather.current?.temperatureC != null
                ? `${weather.current.temperatureC.toFixed(1)} °C`
                : 'Unavailable'}
            </div>
            <div className="text-xs text-[#35C99A]">
              {weather?.available ? weather.current?.weatherCondition : 'API unavailable'}
            </div>
            <div className="pt-2 border-t border-[#9DB2A7]/10 text-[11px] font-mono text-[#9DB2A7] space-y-0.5">
              <div>Source: Open-Meteo</div>
              <div>{weather?.freshnessStatus ?? 'Unavailable'} · {weather?.observationTime?.slice(0, 16) ?? '—'}</div>
            </div>
          </div>

          {/* Card 2: Surface Soil Wetness */}
          <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-2">
            <div className="text-xs text-[#9DB2A7]">Satellite Surface Soil Wetness</div>
            <div className="text-2xl font-mono font-semibold text-[#E8F2ED] tabular-nums">
              {power?.soilWetness ? `${power.soilWetness.value.toFixed(3)}` : 'Unavailable'}
              {power?.soilWetness && <span className="text-xs text-[#9DB2A7] ml-1.5">{' '}index</span>}
            </div>
            <div className="text-xs text-[#65B8D5]">
              0.5° grid (~55 km), not farm-probe live
            </div>
            <div className="pt-2 border-t border-[#9DB2A7]/10 text-[11px] font-mono text-[#9DB2A7] space-y-0.5">
              <div>Source: NASA POWER (SMAP/GEOS-5)</div>
              <div>{power?.freshnessStatus ?? 'Unavailable'} · {power?.soilWetness?.date ?? '—'}</div>
            </div>
          </div>

          {/* Card 3: Land Surface Temp & Rainfall */}
          <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-2">
            <div className="text-xs text-[#9DB2A7]">Land Surface Temp &amp; Rainfall</div>
            <div className="text-2xl font-mono font-semibold text-[#E8F2ED] tabular-nums">
              {power?.landSurfaceTemp ? `${power.landSurfaceTemp.value.toFixed(1)} °C` : 'Unavailable'}
            </div>
            <div className="text-xs text-[#B58C5A] font-mono">
              Precip: {power?.precipitation ? `${power.precipitation.value.toFixed(2)} mm/day` : '—'}
            </div>
            <div className="pt-2 border-t border-[#9DB2A7]/10 text-[11px] font-mono text-[#9DB2A7] space-y-0.5">
              <div>Source: NASA POWER (MODIS/GPM)</div>
              <div>{power?.freshnessStatus ?? 'Unavailable'} · {power?.landSurfaceTemp?.date ?? '—'}</div>
            </div>
          </div>

          {/* Card 4: Active Hazards / Fire Events */}
          <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-2">
            <div className="text-xs text-[#9DB2A7]">Active Fire &amp; Hazard Events</div>
            <div className="text-2xl font-mono font-semibold text-[#E8F2ED] tabular-nums">
              {live ? `${live.activeFireEventsCount} events` : '—'}
            </div>
            <div className="text-xs text-[#9DB2A7]">
              Within ~1,500 km radius (NASA EONET)
            </div>
            <div className="pt-2 border-t border-[#9DB2A7]/10 text-[11px] font-mono text-[#9DB2A7] space-y-0.5">
              <div>Source: NASA EONET v3 {live?.firmsActive ? '+ FIRMS' : ''}</div>
              <div>Recently updated · {live?.weather?.retrievedAt?.slice(0, 10) ?? '—'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Investigation Overview (Database Metrics) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#E8F2ED]">Investigation Database Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Investigations', value: stats.totalInvestigations },
            { label: 'Active Running', value: stats.activeInvestigations },
            { label: 'Completed Studies', value: stats.completedInvestigations },
            { label: 'Concerns Flagged', value: stats.concernsDetected },
            { label: 'Regions Monitored', value: stats.regionsMonitored },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4">
              <div className="text-xs text-[#9DB2A7]">{kpi.label}</div>
              <div className="text-2xl font-mono font-semibold text-[#E8F2ED] mt-1 tabular-nums">
                {kpi.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Eight-Agent Execution Status + Recent Investigations */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Agent Status Panel */}
        <section className="xl:col-span-6 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#E8F2ED]">Autonomous Eight-Agent Pipeline</h2>
              <p className="text-xs text-[#9DB2A7]">Actual execution telemetry from latest investigation</p>
            </div>
          </div>
          <div className="divide-y divide-[#9DB2A7]/10">
            {AGENT_LABELS.map((ag, idx) => {
              const run = agentStatuses[ag.key];
              const status = run?.status ?? 'idle';
              const statusDisplay =
                status === 'completed'
                  ? '● Completed'
                  : status === 'running'
                  ? '▲ Running'
                  : status === 'error'
                  ? '✖ Error'
                  : '◌ Standby';
              const statusColor =
                status === 'completed'
                  ? 'text-[#35C99A]'
                  : status === 'running'
                  ? 'text-[#65B8D5]'
                  : status === 'error'
                  ? 'text-rose-400'
                  : 'text-[#9DB2A7]';

              return (
                <div key={ag.key} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-[#E8F2ED]">
                      {String(idx + 1).padStart(2, '0')}. {ag.name}
                    </div>
                    <div className="font-mono text-[11px] text-[#9DB2A7]">
                      Findings: {run?.findings_count ?? 0} · Last run:{' '}
                      {run?.completed_at ? run.completed_at.slice(0, 16).replace('T', ' ') : 'Not yet executed'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-mono ${statusColor}`}>{statusDisplay}</span>
                    <button
                      onClick={() => onNavigate(AGENT_PAGE_MAP[ag.key])}
                      className="px-2.5 py-1 rounded bg-[#0B1C17] border border-[#9DB2A7]/20 text-[#E8F2ED] hover:border-[#35C99A] transition-colors whitespace-nowrap"
                    >
                      Open
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Saved Investigations */}
        <section className="xl:col-span-6 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#E8F2ED]">Recent Scientific Investigations</h2>
              <p className="text-xs text-[#9DB2A7]">Persisted SQLite investigation archive</p>
            </div>
            <button
              onClick={() => onNavigate('workspace')}
              className="text-xs text-[#35C99A] hover:underline"
            >
              + New Study
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="p-8 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/10 text-center space-y-3">
              <div className="text-sm text-[#E8F2ED]">No saved investigations in database yet.</div>
              <p className="text-xs text-[#9DB2A7]">
                Launch a scientific investigation to retrieve live NASA datasets and run all eight autonomous agents.
              </p>
              <button
                onClick={() => onNavigate('workspace')}
                className="px-4 py-2 rounded-lg bg-[#35C99A] text-[#07120F] text-xs font-semibold"
              >
                Open Investigation Workspace
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#9DB2A7]/10">
              {recent.map((inv) => (
                <div key={inv.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-medium text-[#E8F2ED] truncate">{inv.research_question}</div>
                    <div className="text-[11px] font-mono text-[#9DB2A7]">
                      {inv.region_name}, {inv.country} · {inv.start_date} to {inv.end_date} ·{' '}
                      <span className="text-[#65B8D5]">{inv.verdict ?? inv.status}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectInvestigation(inv.id, 'earth-judge')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#0B1C17] border border-[#9DB2A7]/20 text-xs text-[#35C99A] hover:border-[#35C99A] whitespace-nowrap shrink-0 self-start sm:self-center"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
