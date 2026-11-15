import React from 'react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface CauseInvestigatorPageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

export const CauseInvestigatorPage: React.FC<CauseInvestigatorPageProps> = ({ bundle, onNavigate }) => {
  const causeOut = bundle?.outputs?.cause_investigator;
  const inv = bundle?.investigation ?? null;
  const hypotheses: any[] = causeOut?.hypotheses ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 5 — Cause Investigator"
        description="Investigates the three most scientifically supported hypotheses explaining observed environmental trends. Hypotheses are never presented as proven causation without controlled attribution evidence."
        contextLine={
          inv
            ? `Study: ${inv.region_name} · Period: ${inv.start_date} to ${inv.end_date}`
            : 'No active investigation'
        }
      />

      {!causeOut || hypotheses.length === 0 ? (
        <AgentEmptyState agentName="Cause Investigator" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <>
          <div className="p-3.5 rounded-xl bg-[#0B1C17] border border-[#65B8D5]/30 text-xs text-[#E8F2ED] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              <strong className="text-[#65B8D5]">Scientific Hypothesis Notice:</strong> Explanations below represent candidate physical and anthropogenic mechanisms supported by retrieved observations, subject to Science Challenger audit.
            </span>
            <span className="font-mono text-[#9DB2A7] shrink-0">
              {causeOut.aiPowered ? 'Gemini Scientific Synthesis' : 'Deterministic Evidence Synthesis'}
            </span>
          </div>

          {/* Three Aligned Explanation Cards in One Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            {hypotheses.slice(0, 3).map((h, idx) => (
              <article
                key={idx}
                className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#35C99A]">Hypothesis 0{idx + 1}</span>
                    <span className="text-[#65B8D5]">{h.confidence}</span>
                  </div>

                  <h2 className="text-base font-semibold text-[#E8F2ED] leading-snug">{h.cause}</h2>

                  <div className="space-y-2.5 text-xs">
                    <div>
                      <div className="text-[#9DB2A7] font-medium">Scientific Reasoning</div>
                      <p className="text-[#E8F2ED]/90 mt-0.5 leading-relaxed">{h.scientific_reasoning}</p>
                    </div>

                    <div>
                      <div className="text-[#9DB2A7] font-medium">Supporting Evidence &amp; Measurements</div>
                      <p className="text-[#E8F2ED]/90 mt-0.5">{h.supporting_evidence}</p>
                      <p className="font-mono text-[11px] text-[#35C99A] mt-1">{h.supporting_measurements}</p>
                    </div>

                    <div>
                      <div className="text-[#9DB2A7] font-medium">Alternative Explanations</div>
                      <p className="text-[#9DB2A7] mt-0.5">{h.alternative_explanations}</p>
                    </div>

                    <div>
                      <div className="text-[#9DB2A7] font-medium">Additional Evidence Required</div>
                      <p className="text-[#B58C5A] mt-0.5">{h.additional_evidence_required}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#9DB2A7]/15 text-[11px] font-mono text-[#9DB2A7] space-y-1">
                  <div>Region: {h.geographical_region}</div>
                  <div>Period: {h.observation_period}</div>
                  <div>Datasets: {(h.relevant_datasets ?? []).join(' · ')}</div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
