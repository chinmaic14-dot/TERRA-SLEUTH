import React, { useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  ExternalLink,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { EarthMap } from '../components/maps/EarthMap';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface SolutionCentrePageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

type SolutionSubTab =
  | 'solutions'
  | 'marketplace'
  | 'schemes'
  | 'videos'
  | 'online'
  | 'offline'
  | 'checklist'
  | 'tracker'
  | 'outcome';

const SUB_TABS: { id: SolutionSubTab; label: string }[] = [
  { id: 'solutions', label: 'Recommended Solutions' },
  { id: 'marketplace', label: 'Product Marketplace' },
  { id: 'schemes', label: 'Government Assistance' },
  { id: 'videos', label: 'Watch & Learn' },
  { id: 'online', label: 'Online Applications' },
  { id: 'offline', label: 'Offline Assistance' },
  { id: 'checklist', label: 'Document Checklist' },
  { id: 'tracker', label: 'Implementation Tracker' },
  { id: 'outcome', label: 'Outcome Monitoring' },
];

const DEFAULT_ROLES = [
  'Farmer / Land Steward',
  'Environmentalist / Conservationist',
  'Environmental Researcher / NGO',
  'Water Resource Manager / Irrigation User',
  'Forestry & Ecosystem Restoration Officer',
  'FPO / Watershed Cooperative',
  'Gram Panchayat / Local Administration',
  'Urban Heat & Municipal Planner',
  'Disaster & Wildfire Response Coordinator',
];

const DEFAULT_DOMAINS = [
  { id: 'water', label: 'Water & Soil Moisture' },
  { id: 'soil', label: 'Soil Health & Agriculture' },
  { id: 'fire', label: 'Wildfire & Thermal Risk' },
  { id: 'vegetation', label: 'Vegetation & Forest Canopy' },
  { id: 'heat', label: 'Heat & Surface Thermal Stress' },
];

function resolveClientRoleKey(role: string): string {
  const r = role.toLowerCase();
  if (r.includes('environmentalist') || r.includes('conservationist')) return 'environmentalist';
  if (r.includes('researcher') || r.includes('ngo')) return 'researcher';
  if (r.includes('urban') || r.includes('municipal')) return 'urban';
  if (r.includes('wildfire') || r.includes('disaster')) return 'wildfire';
  if (r.includes('forestry') || r.includes('ecosystem')) return 'forestry';
  if (r.includes('water resource') || r.includes('irrigation')) return 'water_mgr';
  if (r.includes('fpo') || r.includes('cooperative')) return 'fpo';
  if (r.includes('panchayat') || r.includes('administration')) return 'panchayat';
  return 'farmer';
}

function filterByRoleAndDomain<T extends { targetRoleKey?: string; targetDomain?: string }>(
  items: T[] | undefined,
  activeRoleKey: string,
  activeDomain: string
): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const roleMatch = !item.targetRoleKey || item.targetRoleKey === activeRoleKey;
    const domainMatch = !item.targetDomain || item.targetDomain === activeDomain;
    return roleMatch && domainMatch;
  });
}

export const SolutionCentrePage: React.FC<SolutionCentrePageProps> = ({ bundle, onNavigate }) => {
  const inv = bundle?.investigation ?? null;
  const [subTab, setSubTab] = useState<SolutionSubTab>('solutions');
  const [userType, setUserType] = useState('Farmer / Land Steward');
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [budgetInr, setBudgetInr] = useState(50000);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoLang, setVideoLang] = useState<'all' | 'English' | 'Kannada'>('all');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [interventionDate, setInterventionDate] = useState(
    new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  );
  const [outcomeResult, setOutcomeResult] = useState<any>(null);
  const [outcomeLoading, setOutcomeLoading] = useState(false);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadWorkspace = async (
    refresh = false,
    recalculate = false,
    roleOverride?: string,
    domainOverride?: string
  ) => {
    if (!inv) return;
    const seq = ++loadSeqRef.current;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleOverride ?? (recalculate ? userType : '')) {
        params.set('userType', roleOverride ?? userType);
      }
      const dom = domainOverride !== undefined ? domainOverride : selectedDomain;
      if (dom) {
        params.set('domain', dom);
      }
      params.set('budgetInr', String(budgetInr));
      params.set('refresh', String(refresh));
      params.set('recalculate', String(recalculate));

      const res = await fetch(`/api/solutions/${inv.id}?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (seq !== loadSeqRef.current) return;
      setData(json);
      if (json.userType) setUserType(json.userType);
      if (json.domain) setSelectedDomain(json.domain);
      if (recalculate) {
        setCompareIds([]);
        setOutcomeResult(null);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setSelectedDomain('');
    setOutcomeResult(null);
    void loadWorkspace(false, false, undefined, '');
  }, [inv?.id]);

  const persistPatch = async (patch: Record<string, any>) => {
    if (!inv) return;
    setSaving(true);
    try {
      await fetch(`/api/solutions/${inv.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleChecklist = (id: string) => {
    if (!data) return;
    const updated = data.checklist.map((c: any) =>
      c.id === id ? { ...c, prepared: !c.prepared } : c
    );
    setData({ ...data, checklist: updated });
    void persistPatch({ checklist: updated });
  };

  const toggleTrackerStep = (stepNum: number) => {
    if (!data) return;
    const updated = data.tracker.map((t: any) => {
      if (t.step !== stepNum || t.status === 'verified_by_system') return t;
      const nextStatus = t.status === 'user_entered' ? 'pending' : 'user_entered';
      return {
        ...t,
        status: nextStatus,
        updatedAt: nextStatus === 'user_entered' ? new Date().toISOString() : null,
      };
    });
    setData({ ...data, tracker: updated });
    void persistPatch({ tracker: updated });
  };

  const handleSelectSolution = (solId: string) => {
    if (!data) return;
    const updatedTracker = data.tracker.map((t: any) =>
      t.step === 2
        ? { ...t, status: 'user_entered', updatedAt: new Date().toISOString(), note: solId }
        : t
    );
    setData({ ...data, selectedSolutionId: solId, tracker: updatedTracker });
    void persistPatch({ selectedSolutionId: solId, tracker: updatedTracker });
  };

  const runOutcomeMonitor = async () => {
    if (!inv) return;
    setOutcomeLoading(true);
    try {
      const res = await fetch(`/api/solutions/${inv.id}/outcome-monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interventionDate,
          domain: selectedDomain || data?.domain,
        }),
      });
      const json = await res.json();
      setOutcomeResult(json);
    } finally {
      setOutcomeLoading(false);
    }
  };

  if (!inv) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Solution Centre"
          description="Action and implementation hub connecting scientific investigation verdicts to real products, government schemes, Kannada/English tutorials, offline assistance, checklists, and outcome monitoring."
        />
        <AgentEmptyState agentName="Solution Centre" investigation={null} onNavigate={onNavigate} />
      </div>
    );
  }

  const activeRoleKey = data?.roleKey ?? resolveClientRoleKey(userType);
  const activeDomain = selectedDomain || data?.domain || 'water';
  const filteredSolutions = filterByRoleAndDomain<any>(data?.solutions, activeRoleKey, activeDomain);
  const portals = data?.portals ?? { schemes: [], productPlatforms: [], videos: [] };
  const filteredPlatforms = filterByRoleAndDomain<any>(portals.productPlatforms, activeRoleKey, activeDomain);
  const filteredSchemes = filterByRoleAndDomain<any>(portals.schemes, activeRoleKey, activeDomain);
  const filteredVideos = filterByRoleAndDomain<any>(portals.videos, activeRoleKey, activeDomain).filter((v: any) =>
    videoLang === 'all' ? true : v.language.toLowerCase().includes(videoLang.toLowerCase())
  );
  const filteredChecklist = filterByRoleAndDomain<any>(data?.checklist, activeRoleKey, activeDomain);
  const filteredTracker = filterByRoleAndDomain<any>(data?.tracker, activeRoleKey, activeDomain);

  const relevantFallbackRoles = (() => {
    const q = `${inv.category ?? ''} ${inv.research_question ?? ''}`.toLowerCase();
    if (q.includes('wildfire') || q.includes('fire')) {
      return [
        'Disaster & Wildfire Response Coordinator',
        'Forestry & Ecosystem Restoration Officer',
        'Environmentalist / Conservationist',
        'Environmental Researcher / NGO',
      ];
    }
    if (q.includes('urban') || q.includes('city') || q.includes('municipal')) {
      return [
        'Urban Heat & Municipal Planner',
        'Environmentalist / Conservationist',
        'Environmental Researcher / NGO',
      ];
    }
    if (q.includes('forest') || q.includes('deforest') || q.includes('canopy')) {
      return [
        'Forestry & Ecosystem Restoration Officer',
        'Environmentalist / Conservationist',
        'Environmental Researcher / NGO',
      ];
    }
    return [
      'Farmer / Land Steward',
      'Water Resource Manager / Irrigation User',
      'FPO / Watershed Cooperative',
      'Gram Panchayat / Local Administration',
      'Environmental Researcher / NGO',
    ];
  })();
  const roleOptions: string[] = data?.availableRoles ?? relevantFallbackRoles;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solution Centre — Environmental Action & Implementation Hub"
        description="Convert verified NASA investigation findings into field action through ranked solutions, authorised procurement portals, government scheme guidance, Kannada/English tutorials, offline offices, and outcome monitoring."
        contextLine={`Target Area: ${inv.district || inv.region_name}, ${inv.state}, ${inv.country} · Verdict: ${inv.verdict ?? inv.status}${saving ? ' · Saving…' : ''}`}
        actions={
          <button
            onClick={() => void loadWorkspace(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10251E] border border-[#9DB2A7]/25 text-xs text-[#E8F2ED] hover:border-[#35C99A]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Grounded Search
          </button>
        }
      />

      {/* User Context, Domain Filter & Budget Controls */}
      <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            <div>
              <label className="block text-[#9DB2A7] mb-1">Implementer Role (Matched to Research Question)</label>
              <select
                aria-label="Implementer Role"
                value={roleOptions.includes(userType) ? userType : roleOptions[0]}
                onChange={(e) => {
                  const nextRole = e.target.value;
                  setUserType(nextRole);
                  void loadWorkspace(false, true, nextRole, activeDomain);
                }}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 text-[#E8F2ED]"
              >
                {roleOptions.map((role: string) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">Investigation Domain Filter</label>
              <select
                aria-label="Investigation Domain Filter"
                value={activeDomain}
                onChange={(e) => {
                  const nextDomain = e.target.value;
                  setSelectedDomain(nextDomain);
                  void loadWorkspace(false, true, userType, nextDomain);
                }}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 text-[#E8F2ED]"
              >
                {(data?.availableDomains ?? DEFAULT_DOMAINS).map((dom: { id: string; label: string }) => (
                  <option key={dom.id} value={dom.id}>
                    {dom.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#9DB2A7] mb-1">Indicative Budget (INR)</label>
              <input
                type="number"
                min={5000}
                step={5000}
                value={budgetInr}
                onChange={(e) => setBudgetInr(Number(e.target.value))}
                className="w-full rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-2 font-mono text-[#E8F2ED]"
              />
            </div>
          </div>
          <button
            onClick={() => void loadWorkspace(false, true, userType, activeDomain)}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-[#35C99A] text-[#07120F] font-semibold hover:bg-[#2eb58a] whitespace-nowrap disabled:opacity-60"
          >
            {loading ? 'Recalculating…' : 'Recalculate Solutions'}
          </button>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#9DB2A7]/10 font-mono text-[11px] text-[#9DB2A7]">
            <span>
              Active Scope: <strong className="text-[#35C99A]">{data.userType}</strong>
            </span>
            <span>·</span>
            <span>
              Domain Filter Only: <strong className="text-[#65B8D5]">{data.domainLabel}</strong>
            </span>
            <span>·</span>
            <span>All 9 tabs below are filtered exclusively for this role and domain.</span>
          </div>
        )}
      </div>

      {/* 9 Sub-Section Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-[#0B1C17] p-1.5 rounded-xl border border-[#9DB2A7]/15">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === t.id
                ? 'bg-[#10251E] text-[#35C99A] border border-[#35C99A]/40'
                : 'text-[#9DB2A7] hover:text-[#E8F2ED]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="p-10 text-center text-xs text-[#9DB2A7]">
          <Loader2 className="w-6 h-6 animate-spin text-[#35C99A] mx-auto mb-2" />
          Preparing regional solutions and grounded discovery...
        </div>
      ) : (
        <>
          {/* 1. RECOMMENDED SOLUTIONS */}
          {subTab === 'solutions' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {filteredSolutions.map((sol: any) => {
                  const selected = data?.selectedSolutionId === sol.id;
                  return (
                    <div
                      key={sol.id}
                      className={`bg-[#10251E] border rounded-xl p-5 flex flex-col justify-between gap-4 ${
                        selected ? 'border-[#35C99A]' : 'border-[#9DB2A7]/15'
                      }`}
                    >
                      <div className="space-y-2.5 text-xs">
                        <div className="flex items-center justify-between font-mono">
                          <span className="text-[#35C99A]">Rank #0{sol.rank}</span>
                          <span className="text-[#65B8D5]">{sol.category}</span>
                        </div>
                        <h3 className="text-base font-semibold text-[#E8F2ED]">{sol.title}</h3>
                        <p className="text-[#9DB2A7] leading-relaxed">{sol.scientificBasis}</p>
                        <div>
                          <span className="text-[#E8F2ED] font-medium">Feasibility:</span>{' '}
                          <span className="text-[#9DB2A7]">{sol.feasibility}</span>
                        </div>
                        <div>
                          <span className="text-[#E8F2ED] font-medium">Sustainability:</span>{' '}
                          <span className="text-[#9DB2A7]">{sol.sustainability}</span>
                        </div>
                        <div>
                          <span className="text-[#E8F2ED] font-medium">Cost Guidance:</span>{' '}
                          <span className="text-[#B58C5A]">{sol.estimatedBudgetRange}</span>
                        </div>
                        <div className="pt-2 border-t border-[#9DB2A7]/10">
                          <div className="font-medium text-[#E8F2ED] mb-1">Implementation Steps:</div>
                          <ol className="list-decimal pl-4 space-y-1 text-[#9DB2A7]">
                            {sol.implementationSteps.map((st: string, i: number) => (
                              <li key={i}>{st}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSelectSolution(sol.id)}
                        className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors ${
                          selected
                            ? 'bg-[#35C99A] text-[#07120F]'
                            : 'bg-[#0B1C17] border border-[#9DB2A7]/25 text-[#E8F2ED] hover:border-[#35C99A]'
                        }`}
                      >
                        {selected ? '● Selected Solution' : 'Select This Solution'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {data?.discovery?.groundedSummary && (
                <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#65B8D5]">
                      Google Search Grounded Regional Intelligence
                    </h3>
                    <span className="font-mono text-[11px] text-[#9DB2A7]">
                      Verified: {data.discovery.searchVerifiedAt?.slice(0, 10)}
                    </span>
                  </div>
                  <div className="text-[#E8F2ED]/90 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {data.discovery.groundedSummary}
                  </div>
                  {(data.discovery.groundedUrls ?? []).length > 0 && (
                    <div className="pt-2 border-t border-[#9DB2A7]/10 flex flex-wrap gap-3">
                      {data.discovery.groundedUrls.slice(0, 8).map((u: any, idx: number) => (
                        <a
                          key={idx}
                          href={u.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#35C99A] hover:underline"
                        >
                          {u.title} <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2. PRODUCT MARKETPLACE */}
          {subTab === 'marketplace' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#0B1C17] border border-[#9DB2A7]/20 text-xs text-[#9DB2A7]">
                <strong className="text-[#E8F2ED]">Verified Procurement Policy:</strong> TERRA SLEUTH never fabricates product prices or stock counts. Inspect live pricing and BIS/warranty specs directly on authorised procurement platforms below.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPlatforms.map((p: any) => {
                  const inCompare = compareIds.includes(p.name);
                  return (
                    <div key={p.name} className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3 text-xs flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="font-mono text-[#65B8D5]">{p.sellerType}</div>
                        <h3 className="text-base font-semibold text-[#E8F2ED]">{p.name}</h3>
                        <p className="text-[#9DB2A7] leading-relaxed">{p.description}</p>
                        <div className="text-[#E8F2ED]/80">Specs: {p.specs}</div>
                        <div className="text-[#B58C5A]">{p.availabilityNote}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#9DB2A7]/10">
                        <a
                          href={p.purchaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#35C99A] text-[#07120F] font-semibold"
                        >
                          Continue to Official Store <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() =>
                            setCompareIds((prev) =>
                              prev.includes(p.name) ? prev.filter((x) => x !== p.name) : [...prev, p.name]
                            )
                          }
                          className="px-3 py-2 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/25 text-[#E8F2ED]"
                        >
                          {inCompare ? 'Remove Compare' : 'Compare'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {compareIds.length > 0 && (
                <div className="bg-[#10251E] border border-[#35C99A]/35 rounded-xl p-4 space-y-2 text-xs">
                  <div className="font-semibold text-[#35C99A]">Platform Comparison ({compareIds.length})</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredPlatforms
                      .filter((p: any) => compareIds.includes(p.name))
                      .map((p: any) => (
                        <div key={p.name} className="p-3 rounded bg-[#0B1C17] space-y-1">
                          <div className="font-semibold text-[#E8F2ED]">{p.name}</div>
                          <div className="text-[#9DB2A7]">Seller: {p.sellerType}</div>
                          <div className="text-[#9DB2A7]">Specs: {p.specs}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. GOVERNMENT ASSISTANCE */}
          {subTab === 'schemes' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#0B1C17] border border-[#B58C5A]/30 text-xs text-[#E8F2ED]">
                Approval and subsidy disbursement depend strictly on official department verification and state budget quotas. TERRA SLEUTH never guarantees approval.
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredSchemes.map((sc: any) => (
                  <div key={sc.name} className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3 text-xs flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex justify-between font-mono text-[11px] text-[#65B8D5]">
                        <span>{sc.regionScope}</span>
                        <span>Verified: {sc.lastVerifiedDate}</span>
                      </div>
                      <h3 className="text-base font-semibold text-[#E8F2ED]">{sc.name}</h3>
                      <div className="text-[#9DB2A7]">{sc.department}</div>
                      <p className="text-[#E8F2ED]/90">{sc.benefits}</p>
                      <div><strong className="text-[#E8F2ED]">Eligibility:</strong> <span className="text-[#9DB2A7]">{sc.eligibility}</span></div>
                      <div><strong className="text-[#E8F2ED]">Assistance:</strong> <span className="text-[#B58C5A]">{sc.assistanceAmount}</span></div>
                      <div><strong className="text-[#E8F2ED]">Documents:</strong> <span className="text-[#9DB2A7]">{sc.requiredDocuments.join(', ')}</span></div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[#9DB2A7]/10">
                      <a
                        href={sc.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#35C99A] text-[#07120F] font-semibold"
                      >
                        Apply on Official Portal <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => setSubTab('checklist')}
                        className="px-3 py-2 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/25 text-[#E8F2ED]"
                      >
                        Prepare Documents
                      </button>
                      <button
                        onClick={() => setSubTab('online')}
                        className="px-3 py-2 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/25 text-[#E8F2ED]"
                      >
                        Application Guide
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. WATCH & LEARN */}
          {subTab === 'videos' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#9DB2A7]">Language Filter:</span>
                {(['all', 'English', 'Kannada'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setVideoLang(lang)}
                    className={`px-3 py-1.5 rounded-lg capitalize ${
                      videoLang === lang
                        ? 'bg-[#35C99A]/20 text-[#35C99A] border border-[#35C99A]/40'
                        : 'bg-[#10251E] text-[#9DB2A7] border border-[#9DB2A7]/15'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredVideos.map((v: any, idx: number) => (
                  <div key={idx} className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-mono text-[11px] text-[#65B8D5]">
                      <span>{v.topic}</span>
                      <span>{v.language}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#E8F2ED]">{v.title}</h3>
                    <div className="text-[#9DB2A7]">Publisher: {v.publisher}</div>
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B1C17] border border-[#35C99A]/40 text-[#35C99A] hover:bg-[#35C99A]/10"
                    >
                      <PlayCircle className="w-4 h-4" /> Open Video Tutorial <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. ONLINE APPLICATIONS */}
          {subTab === 'online' && (
            <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-4 text-xs">
              <div className="flex items-center gap-2 text-[#35C99A] font-semibold text-sm">
                <ShieldCheck className="w-4 h-4" />
                {data?.onlineGuidance?.heading ?? 'Official Portal Application Guidance (Zero Sensitive Data Stored)'}
              </div>
              <div className="p-3 rounded-lg bg-[#0B1C17] border border-rose-500/30 text-rose-200">
                Security Notice: Never enter Aadhaar numbers, OTPs, or government portal passwords inside third-party apps. Always authenticate directly on official <code className="text-[#35C99A]">.gov.in</code> / <code className="text-[#35C99A]">.nic.in</code> domains.
              </div>
              <ol className="space-y-3 list-decimal pl-5 text-[#E8F2ED]">
                {(data?.onlineGuidance?.steps ?? []).map((st: any, idx: number) => (
                  <li key={idx}>
                    <strong>{st.title}:</strong> {st.detail}{' '}
                    {st.url && (
                      <a
                        href={st.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#65B8D5] underline ml-1"
                      >
                        {st.urlLabel ?? st.url}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* 6. OFFLINE ASSISTANCE */}
          {subTab === 'offline' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-6 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3 text-xs">
                <h3 className="text-base font-semibold text-[#E8F2ED]">
                  Offline Assistance — {data?.offlineGuidance?.targetDistrict}
                </h3>
                <p className="text-[#9DB2A7]">{data?.offlineGuidance?.verificationPolicy}</p>
                <div className="space-y-1.5">
                  <div className="font-semibold text-[#35C99A]">Authorised Support Offices to Locate:</div>
                  <ul className="list-disc pl-4 space-y-1 text-[#E8F2ED]">
                    {(data?.offlineGuidance?.officeTypes ?? []).map((o: string, i: number) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1.5 pt-2 border-t border-[#9DB2A7]/10">
                  <div className="font-semibold text-[#65B8D5]">Official Government Office Directories:</div>
                  <div className="flex flex-wrap gap-2">
                    {(data?.offlineGuidance?.officialLookupLinks ?? []).map((lnk: any) => (
                      <a
                        key={lnk.url}
                        href={lnk.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#0B1C17] border border-[#9DB2A7]/25 text-[#65B8D5] hover:border-[#65B8D5]"
                      >
                        {lnk.label} <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 pt-2 border-t border-[#9DB2A7]/10">
                  <div className="font-semibold text-[#B58C5A]">Visit Checklist &amp; Questions to Ask:</div>
                  <ul className="list-disc pl-4 space-y-1 text-[#9DB2A7]">
                    {(data?.offlineGuidance?.visitChecklist ?? []).map((vc: string, i: number) => (
                      <li key={i}>{vc}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="lg:col-span-6 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-2">
                <EarthMap
                  center={[inv.latitude, inv.longitude]}
                  zoom={10}
                  markers={[
                    {
                      id: 'inv_center',
                      label: `${inv.district || inv.region_name} Target Area`,
                      latitude: inv.latitude,
                      longitude: inv.longitude,
                      valueText: 'Open directions in Maps for local RSK/KVK',
                      color: '#35C99A',
                    },
                  ]}
                  heightClass="h-[330px]"
                />
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${inv.latitude},${inv.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#65B8D5] hover:underline"
                >
                  Open Area in Google Maps for Turn-by-Turn Directions <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* 7. DOCUMENT CHECKLIST */}
          {subTab === 'checklist' && (
            <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-[#E8F2ED]">Solution Document Checklist</h3>
                <span className="font-mono text-[#35C99A]">
                  {filteredChecklist.filter((c: any) => c.prepared).length} / {filteredChecklist.length} Prepared
                </span>
              </div>
              <div className="divide-y divide-[#9DB2A7]/10">
                {filteredChecklist.map((item: any) => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                    <button
                      onClick={() => toggleChecklist(item.id)}
                      className="flex items-center gap-3 text-left text-[#E8F2ED]"
                    >
                      {item.prepared ? (
                        <CheckSquare className="w-4 h-4 text-[#35C99A] shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-[#9DB2A7] shrink-0" />
                      )}
                      <span className={item.prepared ? 'line-through text-[#9DB2A7]' : ''}>
                        {item.label} {item.required && <span className="text-[#B58C5A]">(Required)</span>}
                      </span>
                    </button>
                    <a
                      href={item.portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#65B8D5] hover:underline shrink-0"
                    >
                      Official Portal <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. IMPLEMENTATION TRACKER */}
          {subTab === 'tracker' && (
            <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-[#E8F2ED]">10-Step Implementation Tracker</h3>
                  <p className="text-[#9DB2A7]">
                    Distinguishes system-verified scientific steps from self-reported user progress (persisted in SQLite).
                  </p>
                </div>
                <span className="font-mono text-[#35C99A]">
                  {filteredTracker.filter((t: any) => t.status !== 'pending').length} / {filteredTracker.length || 10} Completed
                </span>
              </div>
              <div className="divide-y divide-[#9DB2A7]/10">
                {filteredTracker.map((t: any) => (
                  <div key={t.step} className="py-2.5 flex items-center justify-between gap-3">
                    <button
                      onClick={() => toggleTrackerStep(t.step)}
                      disabled={t.status === 'verified_by_system'}
                      className="flex items-center gap-3 text-left disabled:cursor-default"
                    >
                      <span className="font-mono text-[#65B8D5] w-5">{String(t.step).padStart(2, '0')}.</span>
                      {t.status !== 'pending' ? (
                        <CheckSquare className="w-4 h-4 text-[#35C99A] shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-[#9DB2A7] shrink-0" />
                      )}
                      <span className="text-[#E8F2ED]">{t.title}</span>
                    </button>
                    <span
                      className={`font-mono text-[11px] shrink-0 ${
                        t.status === 'verified_by_system'
                          ? 'text-[#35C99A]'
                          : t.status === 'user_entered'
                          ? 'text-[#65B8D5]'
                          : 'text-[#9DB2A7]'
                      }`}
                    >
                      {t.status === 'verified_by_system'
                        ? '● Verified by System'
                        : t.status === 'user_entered'
                        ? '▲ User Entered'
                        : '◌ Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 9. ENVIRONMENTAL OUTCOME MONITORING */}
          {subTab === 'outcome' && (
            <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[#E8F2ED]">Before vs After Environmental Outcome Monitoring</h3>
                  <p className="text-[#9DB2A7]">
                    {data?.outcomeConfig?.roleMonitoringNote ??
                      'Compares real NASA POWER and MODIS NDVI observations before and after your intervention date.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={interventionDate}
                    onChange={(e) => setInterventionDate(e.target.value)}
                    className="rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 px-3 py-1.5 font-mono text-[#E8F2ED]"
                  />
                  <button
                    onClick={runOutcomeMonitor}
                    disabled={outcomeLoading}
                    className="px-4 py-1.5 rounded-lg bg-[#35C99A] text-[#07120F] font-semibold"
                  >
                    {outcomeLoading ? 'Comparing…' : 'Compare Observations'}
                  </button>
                </div>
              </div>

              {outcomeResult && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-[#0B1C17] border border-[#B58C5A]/30 text-[#E8F2ED]">
                    <strong className="text-[#B58C5A]">Scientific Attribution Caveat:</strong> {outcomeResult.scientificCaveat}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#9DB2A7]/15 text-[#9DB2A7] text-left">
                          <th className="py-2 pr-3">Indicator</th>
                          <th className="py-2 pr-3 text-right">Before Mean (n)</th>
                          <th className="py-2 pr-3 text-right">After Mean (n)</th>
                          <th className="py-2 pr-3 text-right">Delta</th>
                          <th className="py-2">Freshness</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#9DB2A7]/10">
                        {(outcomeResult.comparisons ?? []).map((c: any) => (
                          <tr key={c.variable}>
                            <td className="py-2 pr-3 font-sans text-[#E8F2ED]">{c.label} ({c.unit})</td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {c.beforeMean ?? '—'} ({c.beforeCount})
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {c.afterMean ?? '—'} ({c.afterCount})
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-[#35C99A]">
                              {c.delta !== null ? (c.delta > 0 ? `+${c.delta}` : c.delta) : '—'}
                            </td>
                            <td className="py-2 text-[#65B8D5]">{c.freshness}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
