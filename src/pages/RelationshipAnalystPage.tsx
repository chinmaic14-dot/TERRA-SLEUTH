import React, { useState } from 'react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { CorrelationHeatmap } from '../components/charts/CorrelationHeatmap';
import { ScientificChart } from '../components/charts/ScientificChart';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface RelationshipAnalystPageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

type RelGraphTab = 'heatmap' | 'scatter' | 'timeseries' | 'lagged' | 'multivariable';

export const RelationshipAnalystPage: React.FC<RelationshipAnalystPageProps> = ({ bundle, onNavigate }) => {
  const rel = bundle?.outputs?.relationship_analyst;
  const trendOut = bundle?.outputs?.trend_detective;
  const inv = bundle?.investigation ?? null;

  const [tab, setTab] = useState<RelGraphTab>('heatmap');
  const [pairIdx, setPairIdx] = useState(0);

  const pairs: any[] = rel?.pairs ?? [];
  const activePair = pairs[pairIdx] ?? pairs[0] ?? null;

  const normalize = (vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    return vals.map((v) => Math.round(((v - min) / span) * 1000) / 1000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 4 — Relationship Analyst"
        description="Evaluates Pearson r, Spearman rank rho, OLS regression, and lagged cross-correlations across compatible environmental observation periods. Correlation never proves causation."
        contextLine={
          inv
            ? `Study: ${inv.region_name} · Variables evaluated: ${(rel?.variables ?? []).join(', ') || '—'}`
            : 'No active investigation'
        }
      />

      {!rel || rel.status === 'insufficient_variables' ? (
        <AgentEmptyState agentName="Relationship Analyst" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <>
          {/* Scientific Disclaimer Banner */}
          <div className="p-3.5 rounded-xl bg-[#0B1C17] border border-[#B58C5A]/35 text-xs text-[#E8F2ED]">
            <span className="font-semibold text-[#B58C5A]">Methodological Rule:</span> Statistical correlation and cross-correlation quantify co-variation across time. They never prove direct physical causation on their own.
          </div>

          {/* Pairwise Relationship Table */}
          <section className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-[#E8F2ED]">Pairwise Statistical Relationships</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#9DB2A7]/15 text-[#9DB2A7] text-left">
                    <th className="py-2 pr-3">Variable Pair</th>
                    <th className="py-2 pr-3 text-right">n</th>
                    <th className="py-2 pr-3 text-right">Pearson r (p)</th>
                    <th className="py-2 pr-3 text-right">Spearman ρ (p)</th>
                    <th className="py-2 pr-3 text-right">Peak Lag (r)</th>
                    <th className="py-2">Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#9DB2A7]/10 font-mono">
                  {pairs.map((p, idx) => {
                    const levelColor = p.concern_level.startsWith('RED')
                      ? 'text-rose-400'
                      : p.concern_level.startsWith('YELLOW')
                      ? 'text-[#B58C5A]'
                      : 'text-[#35C99A]';
                    return (
                      <tr
                        key={`${p.var_x}_${p.var_y}`}
                        onClick={() => setPairIdx(idx)}
                        className={`cursor-pointer hover:bg-[#0B1C17]/70 ${pairIdx === idx ? 'bg-[#0B1C17]' : ''}`}
                      >
                        <td className="py-2.5 pr-3 text-[#E8F2ED] font-semibold">
                          {p.var_x} × {p.var_y}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{p.sample_size}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {p.pearson_r} (p={p.pearson_p})
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {p.spearman_rho} (p={p.spearman_p})
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          Lag {p.best_lag} ({p.best_lag_r})
                        </td>
                        <td className={`py-2.5 font-sans font-medium ${levelColor}`}>
                          {p.concern_level}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* 5 Named Graph Tabs */}
          <div className="flex flex-wrap gap-2 bg-[#0B1C17] p-1.5 rounded-xl border border-[#9DB2A7]/15">
            {(
              [
                { id: 'heatmap', label: '1. Correlation Heatmap' },
                { id: 'scatter', label: '2. Scatter Plot & Fit' },
                { id: 'timeseries', label: '3. Time-Series Comparison' },
                { id: 'lagged', label: '4. Lagged Relationship Graph' },
                { id: 'multivariable', label: '5. Multi-Variable Comparison' },
              ] as { id: RelGraphTab; label: string }[]
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

          {tab === 'heatmap' && (
            <CorrelationHeatmap
              title="Environmental Variable Correlation Heatmap"
              variables={rel.variables ?? []}
              matrix={rel.matrix ?? []}
              source="Python Pearson Matrix over NASA POWER & MODIS"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
            />
          )}

          {tab === 'scatter' && activePair && (
            <ScientificChart
              title={`Scatter Plot — ${activePair.var_x} vs ${activePair.var_y} (R² = ${activePair.regression.r2})`}
              xLabel={`${activePair.var_x} (${activePair.unit_x})`}
              yLabel={activePair.var_y}
              unit={activePair.unit_y}
              source="Python Bivariate OLS Regression"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes={`y = ${activePair.regression.slope}x + ${activePair.regression.intercept} · Pearson r = ${activePair.pearson_r} (p=${activePair.pearson_p})`}
              labels={[]}
              defaultChartType="scatter"
              allowTypeToggle={false}
              scatterPoints={activePair.scatter_points.map((pt: any) => ({ x: pt.x, y: pt.y, label: pt.date }))}
              regressionLine={activePair.regression}
            />
          )}

          {tab === 'timeseries' && activePair && (
            <ScientificChart
              title={`Normalized Time-Series Co-Variation — ${activePair.var_x} & ${activePair.var_y}`}
              xLabel="Common Observation Date"
              yLabel="Normalized Scale"
              unit="0–1 normalized"
              source="NASA POWER / MODIS Aligned Dates"
              dateRange={`${activePair.common_dates?.[0] ?? ''} to ${activePair.common_dates?.[activePair.common_dates.length - 1] ?? ''}`}
              dataNotes={`Normalized to [0,1] for visual comparison across units (${activePair.unit_x} vs ${activePair.unit_y}).`}
              labels={activePair.common_dates ?? []}
              series={[
                { id: 'vx', label: `${activePair.var_x} (${activePair.unit_x})`, color: '#35C99A', values: normalize(activePair.values_x) },
                { id: 'vy', label: `${activePair.var_y} (${activePair.unit_y})`, color: '#65B8D5', values: normalize(activePair.values_y) },
              ]}
            />
          )}

          {tab === 'lagged' && activePair && (
            <ScientificChart
              title={`Lagged Cross-Correlation Profile — ${activePair.var_x} leading ${activePair.var_y}`}
              xLabel="Time Lag (steps)"
              yLabel="Correlation r"
              unit="Pearson r"
              source="Python Cross-Correlation Engine"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes={`Strongest cross-correlation observed at lag ${activePair.best_lag} (r = ${activePair.best_lag_r}).`}
              labels={(activePair.lag_profile ?? []).map((l: any) => `Lag ${l.lag}`)}
              defaultChartType="bar"
              referenceLines={[{ value: 0, label: 'Zero', color: '#9DB2A7' }]}
              series={[
                {
                  id: 'lag_r',
                  label: 'Cross-correlation r',
                  color: '#B58C5A',
                  values: (activePair.lag_profile ?? []).map((l: any) => l.r),
                  type: 'bar',
                },
              ]}
            />
          )}

          {tab === 'multivariable' && trendOut?.trends && (
            <ScientificChart
              title="Multi-Variable Normalized Comparison"
              xLabel="Observation Date"
              yLabel="Normalized Index"
              unit="0–1 normalized"
              source="NASA POWER / MODIS Multi-Variable Series"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              labels={trendOut.trends[0]?.dates ?? []}
              series={(trendOut.trends ?? []).slice(0, 6).map((t: any, idx: number) => ({
                id: t.variable,
                label: t.variable,
                color: ['#35C99A', '#65B8D5', '#B58C5A', '#E8F2ED', '#F59E0B', '#A78BFA'][idx % 6],
                values: normalize(t.values.map((v: any) => v ?? 0)),
              }))}
            />
          )}
        </>
      )}
    </div>
  );
};
