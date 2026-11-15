import React from 'react';
import { ArrowRight, ExternalLink, FileText, Wrench } from 'lucide-react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface EarthJudgePageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

export const EarthJudgePage: React.FC<EarthJudgePageProps> = ({ bundle, onNavigate }) => {
  const judge = bundle?.outputs?.earth_judge;
  const inv = bundle?.investigation ?? null;

  const verdictColor =
    judge?.verdict === 'HIGH CONCERN'
      ? 'text-rose-400 border-rose-500/40 bg-rose-950/25'
      : judge?.verdict === 'IMPROVING'
      ? 'text-[#35C99A] border-[#35C99A]/40 bg-[#35C99A]/10'
      : judge?.verdict === 'INSUFFICIENT EVIDENCE'
      ? 'text-[#9DB2A7] border-[#9DB2A7]/30 bg-[#0B1C17]'
      : 'text-[#B58C5A] border-[#B58C5A]/40 bg-[#B58C5A]/10';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 8 — Earth Judge"
        description="Collects structured outputs from all seven preceding agents to deliver an independent, balanced scientific verdict, confidence statement, and prioritized restoration actions."
        contextLine={
          inv
            ? `Research Question: ${inv.research_question}`
            : 'No active investigation'
        }
        actions={
          judge && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onNavigate('solution-centre')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#35C99A] text-[#07120F] text-xs font-semibold hover:bg-[#2eb58a]"
              >
                <Wrench className="w-3.5 h-3.5" /> Open Solution Centre
              </button>
              <button
                onClick={() => onNavigate('scientific-reports')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10251E] border border-[#9DB2A7]/25 text-xs text-[#E8F2ED] hover:border-[#65B8D5]"
              >
                <FileText className="w-3.5 h-3.5" /> Scientific Reports
              </button>
            </div>
          )
        }
      />

      {!judge ? (
        <AgentEmptyState agentName="Earth Judge" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <>
          {/* Final Verdict Banner */}
          <section className={`rounded-xl border p-6 space-y-3 ${verdictColor}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-mono tracking-wider">FINAL EARTH JUDGE VERDICT</div>
              <div className="text-xs font-mono">
                Confidence: {judge.confidence_level} · {judge.aiPowered ? 'Gemini + Python Synthesis' : 'Deterministic Evidence Synthesis'}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight">{judge.verdict}</div>
            <p className="text-sm text-[#E8F2ED] leading-relaxed">{judge.executive_summary}</p>
          </section>

          {/* Study Area, Methodology & Uncertainty */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3 text-xs">
              <h2 className="text-base font-semibold text-[#E8F2ED]">Methodology &amp; Study Context</h2>
              <div className="font-mono text-[#65B8D5]">
                Study Area: {judge.studyArea} · {judge.coordinates} · Period: {judge.observationPeriod}
              </div>
              <p className="text-[#E8F2ED]/90 leading-relaxed">{judge.methodology}</p>
              <div className="pt-2 border-t border-[#9DB2A7]/10">
                <div className="font-semibold text-[#B58C5A] mb-1">Uncertainty &amp; Limitations</div>
                <p className="text-[#9DB2A7] leading-relaxed">{judge.uncertainty_statement}</p>
              </div>
            </section>

            <section className="lg:col-span-5 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3 text-xs">
              <h2 className="text-base font-semibold text-[#E8F2ED]">Recommended Scientific Actions</h2>
              <div className="space-y-3">
                {(judge.recommended_actions ?? []).map((act: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/10 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#35C99A]">0{idx + 1}. {act.title}</span>
                      <span className="font-mono text-[10px] text-[#65B8D5]">{act.timeframe}</span>
                    </div>
                    <p className="text-[#9DB2A7]">{act.rationale}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => onNavigate('solution-centre')}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#0B1C17] border border-[#35C99A]/40 text-xs font-medium text-[#35C99A] hover:bg-[#35C99A]/10"
              >
                Implement in Solution Centre <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </section>
          </div>

          {/* Evidence Synthesis Grid: Trends, Opposite Trends, Challenges */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-[#E8F2ED]">Statistical Trends &amp; Opposite Regional Checks</h3>
              <div className="space-y-2 font-mono">
                {(judge.trendsSummary ?? []).map((t: any) => (
                  <div key={t.variable} className="p-2.5 rounded bg-[#0B1C17] flex justify-between gap-2">
                    <span className="text-[#E8F2ED]">{t.variable} ({t.unit})</span>
                    <span className="text-[#35C99A]">
                      {t.classification} · slope={t.slope} (p={t.p_value})
                    </span>
                  </div>
                ))}
              </div>
              {(judge.oppositeTrendsSummary ?? []).length > 0 && (
                <div className="pt-2 border-t border-[#9DB2A7]/10 space-y-1">
                  <div className="font-semibold text-[#65B8D5]">Opposite Regional Trend Audit</div>
                  {judge.oppositeTrendsSummary.map((o: any) => (
                    <div key={o.variable} className="text-[#9DB2A7]">
                      {o.variable}: {o.summary}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-[#E8F2ED]">References &amp; Provenance</h3>
              <ul className="space-y-2">
                {(judge.references ?? []).map((r: any, idx: number) => (
                  <li key={idx}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#65B8D5] hover:underline"
                    >
                      {r.title} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
};
