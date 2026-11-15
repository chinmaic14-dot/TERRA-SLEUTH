import React, { useState } from 'react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { ScientificChart } from '../components/charts/ScientificChart';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface ImpactAnalystPageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

type ImpactGraphTab = 'severity' | 'regional' | 'var_vs_impact' | 'historical' | 'multi_sector';

export const ImpactAnalystPage: React.FC<ImpactAnalystPageProps> = ({ bundle, onNavigate }) => {
  const imp = bundle?.outputs?.impact_analyst;
  const trendOut = bundle?.outputs?.trend_detective;
  const inv = bundle?.investigation ?? null;

  const [tab, setTab] = useState<ImpactGraphTab>('severity');

  const impacts: any[] = imp?.impacts ?? [];
  const regionalImpacts: any[] = imp?.regionalImpacts ?? [];
  const varVsImpact: any[] = imp?.variableVsImpact ?? [];
  const primaryTrend = trendOut?.trends?.[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 7 — Impact Analyst"
        description="Evaluates potential environmental and societal exposure across agriculture, water, ecosystems, settlements, and livelihoods — strictly distinguishing potential exposure from confirmed ground damage."
        contextLine={
          inv
            ? `Study: ${inv.region_name} · Sectors Assessed: ${impacts.length}`
            : 'No active investigation'
        }
      />

      {!imp || impacts.length === 0 ? (
        <AgentEmptyState agentName="Impact Analyst" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <>
          <div className="p-3.5 rounded-xl bg-[#0B1C17] border border-[#9DB2A7]/20 text-xs text-[#9DB2A7]">
            <strong className="text-[#E8F2ED]">Integrity Guardrail:</strong> Normalized exposure indices (0–100) represent relative monitoring priority based on environmental shifts. TERRA SLEUTH never fabricates affected population headcounts or monetary damages.
          </div>

          {/* 5 Named Graph Tabs */}
          <div className="flex flex-wrap gap-2 bg-[#0B1C17] p-1.5 rounded-xl border border-[#9DB2A7]/15">
            {(
              [
                { id: 'severity', label: '1. Impact Severity Graph' },
                { id: 'regional', label: '2. Regional Impact Graph' },
                { id: 'var_vs_impact', label: '3. Env Variable vs Impact' },
                { id: 'historical', label: '4. Historical Impact Trend' },
                { id: 'multi_sector', label: '5. Multi-Sector Comparison' },
              ] as { id: ImpactGraphTab; label: string }[]
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

          {tab === 'severity' && (
            <ScientificChart
              title="Sectoral Environmental Exposure & Priority Index"
              xLabel="Potentially Affected Sector"
              yLabel="Exposure Priority Index"
              unit="0–100 index"
              source="Impact Analyst Synthesis (Satellite Evidence)"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes="Represents analytical exposure priority, NOT financial loss or population headcount."
              labels={impacts.map((i) => i.sector)}
              defaultChartType="bar"
              referenceLines={[
                { value: 70, label: 'High Exposure Threshold', color: '#EF4444' },
                { value: 40, label: 'Moderate Threshold', color: '#B58C5A' },
              ]}
              series={[
                {
                  id: 'sev',
                  label: 'Exposure Priority Score',
                  color: '#B58C5A',
                  values: impacts.map((i) => i.severity_score),
                  type: 'bar',
                },
              ]}
            />
          )}

          {tab === 'regional' && (
            <ScientificChart
              title="Regional Spatial Change Magnitude Across Monitored Nodes"
              xLabel="Geographic Node"
              yLabel="Absolute Shift"
              unit="native var unit"
              source="Geo Intelligence + Impact Analyst"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              labels={regionalImpacts.map((r) => r.location)}
              defaultChartType="bar"
              series={[
                {
                  id: 'reg',
                  label: 'Absolute Environmental Change',
                  color: '#65B8D5',
                  values: regionalImpacts.map((r) => Math.abs(r.changeMagnitude ?? 0)),
                  type: 'bar',
                },
              ]}
            />
          )}

          {tab === 'var_vs_impact' && (
            <ScientificChart
              title="Environmental Variable Trend Strength (|Mann-Kendall Z|)"
              xLabel="Environmental Variable"
              yLabel="|Mann-Kendall Z|"
              unit="Z-statistic"
              source="Python Mann-Kendall Significance Driver"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              referenceLines={[{ value: 1.96, label: 'p = 0.05 (|Z|=1.96)', color: '#35C99A' }]}
              labels={varVsImpact.map((v) => v.variable)}
              defaultChartType="bar"
              series={[
                {
                  id: 'zmag',
                  label: '|MK Z| Driver Strength',
                  color: '#35C99A',
                  values: varVsImpact.map((v) => v.abs_z_slope),
                  type: 'bar',
                },
              ]}
            />
          )}

          {tab === 'historical' && primaryTrend && (
            <ScientificChart
              title={`Historical Exposure Trajectory (|Z-Score| of ${primaryTrend.variable})`}
              xLabel="Observation Date"
              yLabel="Stress Deviation"
              unit="|Z-score|"
              source="NASA POWER / MODIS Historical Stress Deviation"
              dateRange={`${primaryTrend.start_date} to ${primaryTrend.end_date}`}
              referenceLines={[{ value: 2.0, label: 'Extreme Anomaly (2σ)', color: '#B58C5A' }]}
              labels={primaryTrend.dates}
              series={[
                {
                  id: 'stress',
                  label: `|Z-Score| (${primaryTrend.variable})`,
                  color: '#B58C5A',
                  values: (primaryTrend.anomalies?.z_scores ?? []).map((z: number) => Math.abs(z)),
                },
              ]}
            />
          )}

          {tab === 'multi_sector' && (
            <ScientificChart
              title="Multi-Sector Exposure vs Uncertainty Comparison"
              xLabel="Sector"
              yLabel="Index"
              unit="0–100"
              source="Impact Analyst Multi-Sector Matrix"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              labels={impacts.map((i) => i.sector)}
              defaultChartType="bar"
              series={[
                {
                  id: 'exp',
                  label: 'Exposure Priority',
                  color: '#35C99A',
                  values: impacts.map((i) => i.severity_score),
                  type: 'bar',
                },
                {
                  id: 'baseline',
                  label: '40-pt Moderate Baseline',
                  color: '#65B8D5',
                  values: impacts.map(() => 40),
                  type: 'line',
                  dashed: true,
                },
              ]}
            />
          )}

          {/* Sector Cards Table */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {impacts.map((im, idx) => {
              const sevColor =
                im.severity === 'HIGH IMPACT'
                  ? 'text-rose-400'
                  : im.severity === 'MODERATE IMPACT'
                  ? 'text-[#B58C5A]'
                  : 'text-[#35C99A]';
              return (
                <div key={idx} className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#E8F2ED]">{im.sector}</h3>
                    <span className={`font-mono font-semibold ${sevColor}`}>{im.severity}</span>
                  </div>
                  <div className="text-[#9DB2A7]">
                    <strong className="text-[#E8F2ED]">Affected Area:</strong> {im.affected_area}
                  </div>
                  <div className="text-[#9DB2A7]">
                    <strong className="text-[#E8F2ED]">Environmental Evidence:</strong> {im.environmental_evidence}
                  </div>
                  <div className="text-[#65B8D5]">{im.exposure_vs_confirmed}</div>
                  <div className="pt-2 border-t border-[#9DB2A7]/10 flex flex-wrap justify-between gap-2 text-[11px] font-mono text-[#9DB2A7]">
                    <span>Time Scale: {im.time_scale}</span>
                    <span>Uncertainty: {im.uncertainty}</span>
                  </div>
                  <div className="text-[11px] text-[#35C99A]">Monitoring: {im.monitoring_requirements}</div>
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
};
