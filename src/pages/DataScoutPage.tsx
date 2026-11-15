import React from 'react';
import { ExternalLink } from 'lucide-react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { ScientificChart } from '../components/charts/ScientificChart';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface DataScoutPageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

export const DataScoutPage: React.FC<DataScoutPageProps> = ({ bundle, onNavigate }) => {
  const scout = bundle?.outputs?.data_scout;
  const inv = bundle?.investigation ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 1 — Data Scout"
        description="NASA Earthdata Common Metadata Repository (CMR) discovery, POWER/MODIS observation retrieval, unit verification, missing-data audit, and provenance preparation."
        contextLine={
          inv
            ? `Investigation: ${inv.region_name} (${inv.start_date} to ${inv.end_date})`
            : 'No active investigation selected'
        }
      />

      {!scout ? (
        <AgentEmptyState agentName="Data Scout" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <>
          {/* Dataset Inventory Table */}
          <section className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#E8F2ED]">Retrieved &amp; Validated NASA Datasets</h2>
              <span className="text-xs font-mono text-[#9DB2A7]">
                Retrieved: {scout.retrievedAt?.slice(0, 19).replace('T', ' ')} UTC
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#9DB2A7]/15 text-[#9DB2A7] text-left">
                    <th className="py-2 pr-3">Variable</th>
                    <th className="py-2 pr-3">Dataset &amp; NASA Mission</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Time Period</th>
                    <th className="py-2 pr-3">Resolution (Spatial / Temp)</th>
                    <th className="py-2 pr-3 text-right">Missing %</th>
                    <th className="py-2 pr-3">Quality</th>
                    <th className="py-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#9DB2A7]/10">
                  {(scout.datasets ?? []).map((d: any) => (
                    <tr key={d.variable}>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-[#35C99A]">{d.variable}</td>
                      <td className="py-2.5 pr-3">
                        <div className="text-[#E8F2ED] font-medium">{d.dataset}</div>
                        <div className="text-[11px] text-[#9DB2A7]">{d.mission}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[#9DB2A7]">{d.unit}</td>
                      <td className="py-2.5 pr-3 font-mono text-[#E8F2ED] whitespace-nowrap">{d.timePeriod}</td>
                      <td className="py-2.5 pr-3 text-[#9DB2A7]">
                        <div>{d.spatialResolution}</div>
                        <div className="text-[11px]">{d.temporalResolution}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-[#E8F2ED]">
                        {d.missingPct}% ({d.validPoints}/{d.totalPoints})
                      </td>
                      <td className="py-2.5 pr-3 font-mono">
                        <span
                          className={
                            d.quality === 'High'
                              ? 'text-[#35C99A]'
                              : d.quality === 'Moderate'
                              ? 'text-[#65B8D5]'
                              : 'text-[#B58C5A]'
                          }
                        >
                          ● {d.quality}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <a
                          href={d.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#65B8D5] hover:underline"
                        >
                          Link <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Data Quality & Missingness Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ScientificChart
              title="Missing Observation Percentage by Dataset"
              xLabel="Environmental Variable"
              yLabel="Missingness"
              unit="%"
              source="Data Scout Validation Audit"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes="Calculated from NASA POWER (-999 fill values) and MODIS QA masks."
              labels={(scout.datasets ?? []).map((d: any) => d.variable)}
              defaultChartType="bar"
              series={[
                {
                  id: 'missing',
                  label: 'Missing Data %',
                  color: '#B58C5A',
                  values: (scout.datasets ?? []).map((d: any) => d.missingPct),
                  type: 'bar',
                },
              ]}
            />

            <ScientificChart
              title="Valid Observations Count per Variable"
              xLabel="Environmental Variable"
              yLabel="Valid Observations"
              unit="records"
              source="Data Scout Validation Audit"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes="Number of non-fill observations passed downstream to Trend Detective."
              labels={(scout.datasets ?? []).map((d: any) => d.variable)}
              defaultChartType="bar"
              series={[
                {
                  id: 'valid',
                  label: 'Valid Points',
                  color: '#35C99A',
                  values: (scout.datasets ?? []).map((d: any) => d.validPoints),
                  type: 'bar',
                },
              ]}
            />
          </div>

          {/* CMR Catalog & FIRMS/EONET Discovery */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#E8F2ED]">NASA Earthdata CMR Discovered Collections</h3>
              <div className="divide-y divide-[#9DB2A7]/10">
                {(scout.cmrCollections ?? []).map((c: any) => (
                  <div key={c.id} className="py-3 space-y-1 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-[#E8F2ED]">{c.title}</span>
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#65B8D5] hover:underline shrink-0 inline-flex items-center gap-1"
                      >
                        Earthdata <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="font-mono text-[11px] text-[#35C99A]">
                      {c.shortName} · {c.dataCenter} · {c.timeStart ?? '—'} → {c.timeEnd}
                    </div>
                    <p className="text-[#9DB2A7] line-clamp-2">{c.summary}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-5 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#E8F2ED]">Active Hazard &amp; Fire Feeds</h3>
              <div className="p-3 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/10 text-xs space-y-1">
                <div className="font-medium text-[#E8F2ED]">NASA FIRMS Status</div>
                <div className="text-[#9DB2A7]">{scout.firmsStatus?.note}</div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-[#9DB2A7]">
                  Nearby NASA EONET Events ({(scout.eonetNearbyEvents ?? []).length})
                </div>
                {(scout.eonetNearbyEvents ?? []).slice(0, 5).map((ev: any) => (
                  <div key={ev.id} className="p-2.5 rounded bg-[#0B1C17] text-xs flex justify-between gap-2">
                    <div>
                      <div className="text-[#E8F2ED]">{ev.title}</div>
                      <div className="font-mono text-[11px] text-[#9DB2A7]">
                        {ev.category} · {ev.date} · ~{ev.distanceKmApprox} km
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
};
