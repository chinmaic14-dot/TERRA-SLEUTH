import React, { useState } from 'react';
import { Download } from 'lucide-react';

interface CorrelationHeatmapProps {
  title: string;
  variables: string[];
  matrix: (number | null)[][];
  source: string;
  dateRange: string;
  dataNotes?: string;
}

function cellColor(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return 'rgba(157, 178, 167, 0.08)';
  if (r >= 0) {
    const alpha = Math.min(0.85, 0.14 + Math.abs(r) * 0.7);
    return `rgba(53, 201, 154, ${alpha.toFixed(2)})`;
  }
  const alpha = Math.min(0.85, 0.14 + Math.abs(r) * 0.7);
  return `rgba(181, 140, 90, ${alpha.toFixed(2)})`;
}

export const CorrelationHeatmap: React.FC<CorrelationHeatmapProps> = ({
  title,
  variables,
  matrix,
  source,
  dateRange,
  dataNotes,
}) => {
  const [hovered, setHovered] = useState<{ v1: string; v2: string; r: number | null } | null>(null);

  const exportCsv = () => {
    const header = ['Variable', ...variables].join(',');
    const rows = variables.map((v, i) => [v, ...(matrix[i] ?? []).map((c) => c ?? '')].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'correlation_heatmap.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-[#E8F2ED]">{title}</h3>
          <div className="text-xs font-mono text-[#9DB2A7] mt-0.5">
            {dateRange} · Pearson Correlation Matrix (r ∈ [-1, +1])
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0B1C17] border border-[#9DB2A7]/15 text-[11px] text-[#9DB2A7] hover:text-[#E8F2ED]"
        >
          <Download className="w-3 h-3" />
          CSV
        </button>
      </div>

      {variables.length < 2 ? (
        <div className="h-44 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/10 flex items-center justify-center text-xs text-[#9DB2A7]">
          Select at least 2 environmental variables to compute a correlation matrix.
        </div>
      ) : (
        <div className="overflow-x-auto bg-[#0B1C17] border border-[#9DB2A7]/10 rounded-lg p-3">
          <table className="w-full border-separate border-spacing-1 text-xs font-mono">
            <thead>
              <tr>
                <th className="p-2 text-left text-[#9DB2A7] font-normal">Variable</th>
                {variables.map((v) => (
                  <th key={v} className="p-2 text-center text-[#E8F2ED] font-medium whitespace-nowrap">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variables.map((rowVar, i) => (
                <tr key={rowVar}>
                  <td className="p-2 text-[#E8F2ED] font-medium whitespace-nowrap">{rowVar}</td>
                  {variables.map((colVar, j) => {
                    const val = matrix[i]?.[j] ?? null;
                    return (
                      <td
                        key={colVar}
                        onMouseEnter={() => setHovered({ v1: rowVar, v2: colVar, r: val })}
                        onMouseLeave={() => setHovered(null)}
                        style={{ backgroundColor: cellColor(val) }}
                        className="p-2.5 text-center rounded text-[#E8F2ED] tabular-nums cursor-default border border-transparent hover:border-[#E8F2ED]/50 transition-colors"
                      >
                        {val !== null ? val.toFixed(2) : 'N/A'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9DB2A7] font-mono">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#35C99A]/80 inline-block" /> Positive r (+1.0)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#B58C5A]/80 inline-block" /> Negative r (-1.0)
              </span>
            </div>
            {hovered && (
              <span className="text-[#65B8D5]">
                {hovered.v1} × {hovered.v2}: r = {hovered.r !== null ? hovered.r.toFixed(4) : 'Insufficient overlap'}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="text-[11px] text-[#9DB2A7] border-t border-[#9DB2A7]/10 pt-2 flex flex-col sm:flex-row sm:justify-between gap-1">
        <span>Source: {source}</span>
        <span>{dataNotes ?? 'Correlation indicates co-variation only; never infer causation without physical controls.'}</span>
      </div>
    </div>
  );
};
