import React, { useState } from 'react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { ScientificChart } from '../components/charts/ScientificChart';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface ScienceChallengerPageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

type ChallengerGraphTab = 'evidence' | 'contradiction' | 'uncertainty' | 'projection';

export const ScienceChallengerPage: React.FC<ScienceChallengerPageProps> = ({ bundle, onNavigate }) => {
  const chall = bundle?.outputs?.science_challenger;
  const inv = bundle?.investigation ?? null;

  const [tab, setTab] = useState<ChallengerGraphTab>('evidence');
  const [projIdx, setProjIdx] = useState(0);

  const projections: any[] = chall?.projections ?? [];
  const contradictionAudit: any[] = chall?.contradictionAudit ?? [];
  const activeProj = projections[projIdx] ?? projections[0] ?? null;

  const projLabels = activeProj
    ? [
        ...(activeProj.historical_tail_dates ?? []),
        ...(activeProj.projection ?? []).map((p: any) => `Proj ${p.label}`),
      ]
    : [];

  const projHistSeries = activeProj
    ? [
        ...(activeProj.historical_tail_values ?? []),
        ...new Array(activeProj.projection?.length ?? 0).fill(null),
      ]
    : [];

  const projForecastSeries = activeProj
    ? [
        ...new Array(Math.max(0, (activeProj.historical_tail_values?.length ?? 1) - 1)).fill(null),
        activeProj.historical_tail_values?.[activeProj.historical_tail_values.length - 1] ?? null,
        ...(activeProj.projection ?? []).map((p: any) => p.projected),
      ]
    : [];

  const projCiLow = activeProj
    ? [
        ...new Array(Math.max(0, (activeProj.historical_tail_values?.length ?? 1) - 1)).fill(null),
        activeProj.historical_tail_values?.[activeProj.historical_tail_values.length - 1] ?? null,
        ...(activeProj.projection ?? []).map((p: any) => p.ci_low),
      ]
    : [];

  const projCiHigh = activeProj
    ? [
        ...new Array(Math.max(0, (activeProj.historical_tail_values?.length ?? 1) - 1)).fill(null),
        activeProj.historical_tail_values?.[activeProj.historical_tail_values.length - 1] ?? null,
        ...(activeProj.projection ?? []).map((p: any) => p.ci_high),
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 6 — Science Challenger"
        description="Independently audits data reliability, missing-data bias, autocorrelation inflation, test contradictions (OLS vs Mann-Kendall), and projection uncertainty — rejecting weak conclusions."
        contextLine={
          inv
            ? `Study: ${inv.region_name} · Rejected weak claims: ${(chall?.rejected_claims ?? []).length}`
            : 'No active investigation'
        }
      />

      {!chall ? (
        <AgentEmptyState agentName="Science Challenger" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <>
          {/* Rejected Weak Claims */}
          {(chall.rejected_claims ?? []).length > 0 && (
            <section className="bg-[#10251E] border border-rose-500/30 rounded-xl p-5 space-y-2.5">
              <h2 className="text-sm font-semibold text-rose-300">Claims Rejected by Science Challenger</h2>
              <ul className="space-y-1.5 text-xs text-[#E8F2ED] list-disc pl-5">
                {chall.rejected_claims.map((rc: string, i: number) => (
                  <li key={i}>{rc}</li>
                ))}
              </ul>
            </section>
          )}

          {/* 4 Named Graph Tabs */}
          <div className="flex flex-wrap gap-2 bg-[#0B1C17] p-1.5 rounded-xl border border-[#9DB2A7]/15">
            {(
              [
                { id: 'evidence', label: '1. Evidence Comparison Graph' },
                { id: 'contradiction', label: '2. Contradiction Graph (OLS vs MK p-values)' },
                { id: 'uncertainty', label: '3. Uncertainty & Autocorrelation Graph' },
                { id: 'projection', label: '4. Historical vs Projection Graph' },
              ] as { id: ChallengerGraphTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-[#10251E] text-[#35C99A] border border-[#35C99A]/40'
                    : 'text-[#9DB2A7] hover:text-[#E8F2ED]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'evidence' && (
            <ScientificChart
              title="Evidence Reliability Score by Variable (0–100 Composite Audit)"
              xLabel="Environmental Variable"
              yLabel="Reliability Score"
              unit="pts / 100"
              source="Python Reliability Audit (Sample Size, Missingness, Autocorrelation, Method Agreement)"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes="Lower scores reflect short windows, high missingness, lag-1 autocorrelation, or OLS/MK disagreement."
              labels={projections.map((p) => p.variable)}
              defaultChartType="bar"
              referenceLines={[{ value: 65, label: 'Minimum High-Confidence Threshold', color: '#35C99A' }]}
              series={[
                {
                  id: 'rel',
                  label: 'Reliability Score',
                  color: '#65B8D5',
                  values: projections.map((p) => p.reliability_score),
                  type: 'bar',
                },
              ]}
            />
          )}

          {tab === 'contradiction' && (
            <ScientificChart
              title="Contradiction Graph — Parametric OLS p-value vs Non-Parametric Mann-Kendall p-value"
              xLabel="Environmental Variable"
              yLabel="p-value"
              unit="p (α=0.05)"
              source="Python Statistical Contradiction Check"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes="Divergence across the 0.05 line indicates parametric vs non-parametric test disagreement."
              labels={contradictionAudit.map((c) => c.variable)}
              defaultChartType="bar"
              referenceLines={[{ value: 0.05, label: 'α = 0.05 Significance Threshold', color: '#B58C5A' }]}
              series={[
                { id: 'olsp', label: 'OLS p-value', color: '#35C99A', values: contradictionAudit.map((c) => c.ols_p), type: 'bar' },
                { id: 'mkp', label: 'Deseasonalized MK p-value', color: '#65B8D5', values: contradictionAudit.map((c) => c.mk_p), type: 'bar' },
              ]}
            />
          )}

          {tab === 'uncertainty' && (
            <ScientificChart
              title="Uncertainty Drivers — Missing Data % & Lag-1 Autocorrelation"
              xLabel="Environmental Variable"
              yLabel="Magnitude"
              unit="% / |r1|×100"
              source="Python Autocorrelation & Missingness Audit"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes="High lag-1 autocorrelation inflates naive trend significance; values scaled to 0–100."
              labels={contradictionAudit.map((c) => c.variable)}
              defaultChartType="bar"
              series={[
                { id: 'miss', label: 'Missingness (%)', color: '#B58C5A', values: contradictionAudit.map((c) => c.missing_pct), type: 'bar' },
                { id: 'ac', label: 'Lag-1 Autocorrelation (|r1|×100)', color: '#65B8D5', values: contradictionAudit.map((c) => Math.round(c.autocorr * 1000) / 10), type: 'bar' },
              ]}
            />
          )}

          {tab === 'projection' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {projections.map((p, idx) => (
                  <button
                    key={p.variable}
                    onClick={() => setProjIdx(idx)}
                    className={`px-2.5 py-1 rounded text-xs font-mono ${
                      projIdx === idx
                        ? 'bg-[#35C99A]/20 text-[#35C99A] border border-[#35C99A]/40'
                        : 'bg-[#10251E] text-[#9DB2A7] border border-[#9DB2A7]/15'
                    }`}
                  >
                    {p.variable}
                  </button>
                ))}
              </div>
              {activeProj && (
                <ScientificChart
                  title={`Historical vs Linear Projection with 95% Uncertainty Band — ${activeProj.variable}`}
                  xLabel="Historical Dates & Projection Steps"
                  yLabel={activeProj.variable}
                  unit={activeProj.unit}
                  source="Python OLS Projection (Assumes Stationarity — NOT a Guaranteed Outcome)"
                  dateRange={`${activeProj.historical_tail_dates?.[0] ?? ''} + 12 steps`}
                  dataNotes={`Final projection 95% CI width: ±${(activeProj.uncertainty_width_final / 2).toFixed(3)} ${activeProj.unit}. Projections are illustrative linear extrapolations only.`}
                  labels={projLabels}
                  series={[
                    { id: 'hist', label: 'Observed Historical', color: '#35C99A', values: projHistSeries },
                    {
                      id: 'proj',
                      label: 'Linear Projection (95% CI)',
                      color: '#B58C5A',
                      values: projForecastSeries,
                      ciLow: projCiLow,
                      ciHigh: projCiHigh,
                      dashed: true,
                    },
                  ]}
                />
              )}
            </div>
          )}

          {/* Detailed Challenge Audit Findings */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#E8F2ED]">Structured Scientific Challenges</h2>
              <span className="font-mono text-[11px] text-[#9DB2A7]">
                {(chall.challenges ?? []).length} Verified Audits
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(chall.challenges ?? []).map((c: any, idx: number) => (
                <div key={idx} className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 flex flex-col justify-between gap-3 text-xs">
                  <div className="space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-[#9DB2A7]/10">
                      <h3 className="font-semibold text-[#E8F2ED] text-sm leading-snug flex-1 min-w-0">
                        {c.finding}
                      </h3>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#B58C5A]/10 border border-[#B58C5A]/30 font-mono text-[11px] font-medium text-[#B58C5A] leading-tight shrink-0 self-start sm:self-center">
                        {c.verdict_on_claim}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-[#65B8D5] leading-relaxed">Evidence: {c.evidence}</div>
                    <div><span className="text-[#9DB2A7]">Critique:</span> {c.reason}</div>
                    <div><span className="text-[#9DB2A7]">Contradictions:</span> {c.contradictions}</div>
                    <div><span className="text-[#9DB2A7]">Cause Assessment:</span> {c.cause_assessment}</div>
                    <div><span className="text-[#9DB2A7]">Projection &amp; Assumptions:</span> {c.projection_and_assumptions}</div>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-[#9DB2A7]/10">
                    <div className="flex flex-wrap justify-between gap-2 text-[11px] font-mono text-[#9DB2A7]">
                      <span>Duration: {c.observation_duration}</span>
                      <span>Confidence: {c.confidence}</span>
                    </div>
                    <div className="text-[11px] text-[#B58C5A] leading-relaxed">
                      Limitations: {c.scientific_limitations}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
