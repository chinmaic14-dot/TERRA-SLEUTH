import React from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { useLanguage } from '../context/LanguageContext';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface ScientificReportsPageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

export const ScientificReportsPage: React.FC<ScientificReportsPageProps> = ({ bundle, onNavigate }) => {
  const { language } = useLanguage();
  const langQuery = `lang=${encodeURIComponent(language.code)}&langName=${encodeURIComponent(language.name)}`;
  const inv = bundle?.investigation ?? null;
  const scout = bundle?.outputs?.data_scout;
  const trendOut = bundle?.outputs?.trend_detective;
  const relOut = bundle?.outputs?.relationship_analyst;
  const causeOut = bundle?.outputs?.cause_investigator;
  const challOut = bundle?.outputs?.science_challenger;
  const impOut = bundle?.outputs?.impact_analyst;
  const judgeOut = bundle?.outputs?.earth_judge;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scientific Reports"
        description="Generate and download concise, publication-grade PDF documents directly from verified investigation records: (1) the Scientific Investigation Report PDF and (2) the Environmental Action Plan PDF."
        contextLine={
          inv
            ? `Report Target: ${inv.region_name} · ${inv.start_date} to ${inv.end_date} · Verdict: ${inv.verdict ?? inv.status}`
            : 'No active investigation'
        }
        actions={
          inv && inv.status === 'completed' && (
            <div className="flex flex-wrap gap-2.5">
              <a
                href={`/api/investigations/${inv.id}/pdf/scientific?${langQuery}`}
                download
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#35C99A] text-[#07120F] text-xs font-semibold hover:bg-[#2eb58a]"
              >
                <Download className="w-3.5 h-3.5" />
                Download Scientific Report PDF
              </a>
              <a
                href={`/api/investigations/${inv.id}/pdf/action-plan?${langQuery}`}
                download
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10251E] border border-[#65B8D5]/50 text-[#65B8D5] text-xs font-semibold hover:bg-[#65B8D5]/10"
              >
                <Download className="w-3.5 h-3.5" />
                Download Action Plan PDF
              </a>
            </div>
          )
        }
      />

      {!inv || !judgeOut ? (
        <AgentEmptyState agentName="Scientific Reports" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Scientific Report Preview (18-section concise synthesis) */}
          <section className="lg:col-span-7 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-6 space-y-5 text-xs">
            <div className="border-b border-[#9DB2A7]/15 pb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono text-[#35C99A]">TERRA SLEUTH · SCIENTIFIC REPORT PREVIEW</div>
                <h2 className="text-lg font-semibold text-[#E8F2ED] mt-1">{inv.research_question}</h2>
                <div className="text-[#9DB2A7] font-mono mt-1">
                  {inv.region_name}, {inv.state}, {inv.country} · {inv.latitude.toFixed(4)}°, {inv.longitude.toFixed(4)}° · Elev {inv.elevation_m ?? 'N/A'} m
                </div>
              </div>
              <FileText className="w-6 h-6 text-[#35C99A] shrink-0" />
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-[#E8F2ED] mb-1">Executive Summary &amp; Final Verdict ({judgeOut.verdict})</h3>
                <p className="text-[#9DB2A7] leading-relaxed">{judgeOut.executive_summary}</p>
              </div>

              <div>
                <h3 className="font-semibold text-[#E8F2ED] mb-1">NASA Datasets ({(scout?.datasets ?? []).length})</h3>
                <ul className="space-y-1 text-[#9DB2A7] font-mono">
                  {(scout?.datasets ?? []).map((d: any) => (
                    <li key={d.variable}>
                      {d.variable} — {d.dataset} ({d.mission}) · Missing: {d.missingPct}%
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-[#E8F2ED] mb-1">Major Statistical Trends &amp; Relationships</h3>
                <ul className="space-y-1 text-[#9DB2A7] font-mono">
                  {(trendOut?.trends ?? []).map((t: any) => (
                    <li key={t.variable}>
                      {t.variable}: {t.classification} (OLS slope {t.ols?.slope}, p={t.ols?.p_value}, Sen {t.sens_slope?.slope})
                    </li>
                  ))}
                  {(relOut?.pairs ?? []).slice(0, 3).map((p: any, i: number) => (
                    <li key={i} className="text-[#65B8D5]">
                      {p.var_x} × {p.var_y}: r={p.pearson_r} (p={p.pearson_p}) [{p.concern_level}]
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-[#E8F2ED] mb-1">Three Possible Explanations &amp; Scientific Challenges</h3>
                <ul className="list-disc pl-4 space-y-1 text-[#9DB2A7]">
                  {(causeOut?.hypotheses ?? []).slice(0, 3).map((h: any, i: number) => (
                    <li key={i}>{h.cause} ({h.confidence})</li>
                  ))}
                </ul>
                <p className="text-[#B58C5A] mt-2">
                  Challenges: {(challOut?.rejected_claims ?? []).length} weak claims rejected · Confidence: {judgeOut.confidence_level}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-[#E8F2ED] mb-1">References</h3>
                <div className="flex flex-wrap gap-3">
                  {(judgeOut.references ?? []).map((r: any, idx: number) => (
                    <a
                      key={idx}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#65B8D5] hover:underline"
                    >
                      {r.title} <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#9DB2A7]/15">
              <a
                href={`/api/investigations/${inv.id}/pdf/scientific?${langQuery}`}
                download
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#35C99A] text-[#07120F] font-semibold"
              >
                <Download className="w-4 h-4" />
                Download Complete Scientific Report PDF
              </a>
            </div>
          </section>

          {/* Right: Environmental Action Plan PDF Card */}
          <section className="lg:col-span-5 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-6 space-y-5 text-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-[#9DB2A7]/15 pb-4">
                <div className="text-[11px] font-mono text-[#B58C5A]">SEPARATE DOCUMENT · ACTIONABLE RESTORATION</div>
                <h2 className="text-lg font-semibold text-[#E8F2ED] mt-1">Environmental Action Plan PDF</h2>
                <p className="text-[#9DB2A7] mt-1">
                  Focused operational document containing problem evidence, 3 ranked solutions, implementation steps, verified government portals, and monitoring indicators — keeping product discovery and offices cleanly in the Solution Centre.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-[#E8F2ED] mb-1.5">Three Recommended Actions</h3>
                <ol className="list-decimal pl-4 space-y-2 text-[#9DB2A7]">
                  {(judgeOut.recommended_actions ?? []).map((a: any, i: number) => (
                    <li key={i}>
                      <span className="text-[#E8F2ED] font-medium">{a.title}</span> ({a.timeframe}) — {a.rationale}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h3 className="font-semibold text-[#E8F2ED] mb-1.5">Impacted Sectors Addressed</h3>
                <div className="space-y-1 text-[#9DB2A7]">
                  {(impOut?.impacts ?? []).slice(0, 4).map((im: any, i: number) => (
                    <div key={i}>• {im.sector} — {im.severity}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-3 border-t border-[#9DB2A7]/15">
              <a
                href={`/api/investigations/${inv.id}/pdf/action-plan?${langQuery}`}
                download
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#65B8D5] text-[#07120F] font-semibold"
              >
                <Download className="w-4 h-4" />
                Download Environmental Action Plan PDF
              </a>
              <button
                onClick={() => onNavigate('solution-centre')}
                className="w-full py-2 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/25 text-[#E8F2ED] hover:border-[#35C99A]"
              >
                Manage Checklist &amp; Supplies in Solution Centre
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
