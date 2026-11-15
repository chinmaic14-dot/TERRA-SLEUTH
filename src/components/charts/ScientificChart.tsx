import React, { useMemo, useRef, useState } from 'react';
import { Download, RotateCcw, ZoomIn } from 'lucide-react';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null | undefined)[];
  dashed?: boolean;
  type?: 'line' | 'bar';
  ciLow?: (number | null | undefined)[];
  ciHigh?: (number | null | undefined)[];
}

export interface ChartMarker {
  index: number;
  label: string;
  color: string;
}

export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
}

interface ScientificChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  unit: string;
  source: string;
  dateRange: string;
  dataNotes?: string;
  labels: string[];
  series?: ChartSeries[];
  scatterPoints?: ScatterPoint[];
  regressionLine?: { slope: number; intercept: number };
  markers?: ChartMarker[];
  referenceLines?: { value: number; label: string; color: string }[];
  defaultChartType?: 'line' | 'bar' | 'scatter';
  allowTypeToggle?: boolean;
  height?: number;
  emptyMessage?: string;
}

export const ScientificChart: React.FC<ScientificChartProps> = ({
  title,
  xLabel,
  yLabel,
  unit,
  source,
  dateRange,
  dataNotes,
  labels,
  series = [],
  scatterPoints = [],
  regressionLine,
  markers = [],
  referenceLines = [],
  defaultChartType = 'line',
  allowTypeToggle = true,
  height = 290,
  emptyMessage = 'No verified observations available for this selection.',
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [chartType, setChartType] = useState<'line' | 'bar' | 'scatter'>(defaultChartType);
  const [zoomRange, setZoomRange] = useState<[number, number]>([0, Math.max(0, labels.length - 1)]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverScatter, setHoverScatter] = useState<ScatterPoint | null>(null);

  // Sync zoom range if labels length changes
  const totalLen = labels.length;
  const startIdx = Math.max(0, Math.min(zoomRange[0], Math.max(0, totalLen - 2)));
  const endIdx =
    zoomRange[1] === 0 && totalLen > 0
      ? totalLen - 1
      : Math.max(startIdx + 1, Math.min(zoomRange[1], totalLen - 1));

  const visibleLabels = useMemo(
    () => (chartType === 'scatter' ? [] : labels.slice(startIdx, endIdx + 1)),
    [labels, startIdx, endIdx, chartType]
  );

  const visibleSeries = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        values: s.values.slice(startIdx, endIdx + 1),
        ciLow: s.ciLow?.slice(startIdx, endIdx + 1),
        ciHigh: s.ciHigh?.slice(startIdx, endIdx + 1),
      })),
    [series, startIdx, endIdx]
  );

  const hasData =
    chartType === 'scatter'
      ? scatterPoints.length > 0
      : visibleSeries.some((s) => s.values.some((v) => v !== null && v !== undefined && Number.isFinite(v)));

  const width = 760;
  const padL = 62;
  const padR = 24;
  const padT = 22;
  const padB = 46;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const { minY, maxY, minX, maxX } = useMemo(() => {
    if (chartType === 'scatter') {
      if (scatterPoints.length === 0) return { minY: 0, maxY: 1, minX: 0, maxX: 1 };
      const xs = scatterPoints.map((p) => p.x);
      const ys = scatterPoints.map((p) => p.y);
      let x0 = Math.min(...xs);
      let x1 = Math.max(...xs);
      let y0 = Math.min(...ys);
      let y1 = Math.max(...ys);
      if (x0 === x1) {
        x0 -= 1;
        x1 += 1;
      }
      if (y0 === y1) {
        y0 -= 1;
        y1 += 1;
      }
      const xPad = (x1 - x0) * 0.08;
      const yPad = (y1 - y0) * 0.1;
      return { minX: x0 - xPad, maxX: x1 + xPad, minY: y0 - yPad, maxY: y1 + yPad };
    }

    const nums: number[] = [];
    for (const s of visibleSeries) {
      for (const v of s.values) {
        if (v !== null && v !== undefined && Number.isFinite(v)) nums.push(v);
      }
      if (s.ciLow) {
        for (const v of s.ciLow) if (v !== null && v !== undefined && Number.isFinite(v)) nums.push(v);
      }
      if (s.ciHigh) {
        for (const v of s.ciHigh) if (v !== null && v !== undefined && Number.isFinite(v)) nums.push(v);
      }
    }
    for (const r of referenceLines) nums.push(r.value);
    if (nums.length === 0) return { minY: 0, maxY: 1, minX: 0, maxX: 1 };
    let lo = Math.min(...nums);
    let hi = Math.max(...nums);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.1;
    return { minY: lo - pad, maxY: hi + pad, minX: 0, maxX: Math.max(1, visibleLabels.length - 1) };
  }, [chartType, scatterPoints, visibleSeries, referenceLines, visibleLabels.length]);

  const toPxX = (idx: number) => {
    const denom = Math.max(1, visibleLabels.length - 1);
    return padL + (idx / denom) * plotW;
  };
  const toPxY = (val: number) => {
    return padT + (1 - (val - minY) / (maxY - minY || 1)) * plotH;
  };
  const toScatterX = (val: number) => padL + ((val - minX) / (maxX - minX || 1)) * plotW;

  const handleZoomIn = () => {
    if (totalLen < 6) return;
    const span = endIdx - startIdx;
    if (span <= 4) return;
    const quarter = Math.max(1, Math.floor(span * 0.2));
    setZoomRange([startIdx + quarter, endIdx - quarter]);
  };

  const handleResetZoom = () => {
    setZoomRange([0, Math.max(0, totalLen - 1)]);
  };

  const handleExportCsv = () => {
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    let csv = '';
    if (chartType === 'scatter') {
      csv = `${xLabel},${yLabel},Label\n` + scatterPoints.map((p) => `${p.x},${p.y},"${p.label ?? ''}"`).join('\n');
    } else {
      const headers = [xLabel, ...series.map((s) => `${s.label} (${unit})`)];
      const rows = labels.map((lbl, i) => [lbl, ...series.map((s) => s.values[i] ?? '')].join(','));
      csv = [headers.join(','), ...rows].join('\n');
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(svgRef.current);
    const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minY + (maxY - minY) * (1 - t));
  const xTickIndices = useMemo(() => {
    const n = visibleLabels.length;
    if (n <= 1) return [0];
    const step = Math.max(1, Math.floor((n - 1) / 5));
    const idxs: number[] = [];
    for (let i = 0; i < n; i += step) idxs.push(i);
    if (idxs[idxs.length - 1] !== n - 1) idxs.push(n - 1);
    return idxs;
  }, [visibleLabels.length]);

  return (
    <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="text-sm sm:text-base font-semibold text-[#E8F2ED] leading-snug">{title}</h3>
          <div className="text-xs font-mono text-[#9DB2A7] mt-0.5">
            {dateRange} · Unit: {unit || 'dimensionless'}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {allowTypeToggle && chartType !== 'scatter' && (
            <div className="inline-flex rounded-md bg-[#0B1C17] border border-[#9DB2A7]/15 p-0.5">
              <button
                type="button"
                onClick={() => setChartType('line')}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  chartType === 'line' ? 'bg-[#35C99A]/20 text-[#35C99A]' : 'text-[#9DB2A7] hover:text-[#E8F2ED]'
                }`}
              >
                Line
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  chartType === 'bar' ? 'bg-[#35C99A]/20 text-[#35C99A]' : 'text-[#9DB2A7] hover:text-[#E8F2ED]'
                }`}
              >
                Bar
              </button>
            </div>
          )}
          {chartType !== 'scatter' && totalLen > 6 && (
            <>
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom into central range"
                className="p-1.5 rounded-md bg-[#0B1C17] border border-[#9DB2A7]/15 text-[#9DB2A7] hover:text-[#E8F2ED]"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              {(startIdx > 0 || endIdx < totalLen - 1) && (
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Reset zoom"
                  className="p-1.5 rounded-md bg-[#0B1C17] border border-[#9DB2A7]/15 text-[#65B8D5] hover:text-[#E8F2ED]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0B1C17] border border-[#9DB2A7]/15 text-[11px] text-[#9DB2A7] hover:text-[#E8F2ED]"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
          <button
            type="button"
            onClick={handleExportSvg}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#0B1C17] border border-[#9DB2A7]/15 text-[11px] text-[#9DB2A7] hover:text-[#E8F2ED]"
          >
            <Download className="w-3 h-3" />
            SVG
          </button>
        </div>
      </div>

      {/* Legend */}
      {chartType !== 'scatter' && series.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#9DB2A7]">
          {series.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-0.5"
                style={{
                  backgroundColor: s.color,
                  borderTop: s.dashed ? `2px dashed ${s.color}` : undefined,
                }}
              />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Plot Canvas */}
      {!hasData ? (
        <div className="h-52 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/10 flex items-center justify-center p-6 text-center text-xs text-[#9DB2A7]">
          {emptyMessage}
        </div>
      ) : (
        <div className="relative bg-[#0B1C17] border border-[#9DB2A7]/10 rounded-lg p-2">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none cursor-crosshair"
            onMouseLeave={() => {
              setHoverIdx(null);
              setHoverScatter(null);
            }}
            onMouseMove={(e) => {
              if (chartType === 'scatter' || visibleLabels.length === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * width;
              const clamped = Math.max(padL, Math.min(padL + plotW, relX));
              const ratio = (clamped - padL) / plotW;
              const idx = Math.round(ratio * Math.max(0, visibleLabels.length - 1));
              setHoverIdx(idx);
            }}
          >
            {/* Horizontal grid lines & Y-axis ticks */}
            {yTicks.map((tv, i) => {
              const py = toPxY(tv);
              return (
                <g key={i}>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={py}
                    y2={py}
                    stroke="rgba(157,178,167,0.12)"
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 8}
                    y={py + 3}
                    textAnchor="end"
                    fill="#9DB2A7"
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {Math.abs(tv) >= 100 ? tv.toFixed(0) : Math.abs(tv) >= 1 ? tv.toFixed(2) : tv.toFixed(3)}
                  </text>
                </g>
              );
            })}

            {/* Reference threshold lines */}
            {referenceLines.map((rl, idx) => {
              const py = toPxY(rl.value);
              return (
                <g key={idx}>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={py}
                    y2={py}
                    stroke={rl.color}
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padL + 6}
                    y={py - 4}
                    fill={rl.color}
                    fontSize="9.5"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {rl.label}
                  </text>
                </g>
              );
            })}

            {/* Axes */}
            <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="rgba(157,178,167,0.35)" />
            <line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} stroke="rgba(157,178,167,0.35)" />

            {/* Axis Titles */}
            <text
              x={padL + plotW / 2}
              y={height - 6}
              textAnchor="middle"
              fill="#9DB2A7"
              fontSize="10.5"
            >
              {xLabel}
            </text>
            <text
              x={14}
              y={padT + plotH / 2}
              textAnchor="middle"
              fill="#9DB2A7"
              fontSize="10.5"
              transform={`rotate(-90 14 ${padT + plotH / 2})`}
            >
              {yLabel} {unit ? `(${unit})` : ''}
            </text>

            {/* Scatter Plot Rendering */}
            {chartType === 'scatter' ? (
              <>
                {regressionLine && (
                  <line
                    x1={toScatterX(minX)}
                    y1={toPxY(regressionLine.slope * minX + regressionLine.intercept)}
                    x2={toScatterX(maxX)}
                    y2={toPxY(regressionLine.slope * maxX + regressionLine.intercept)}
                    stroke="#B58C5A"
                    strokeWidth="2"
                    strokeDasharray="5 3"
                  />
                )}
                {scatterPoints.map((pt, i) => (
                  <circle
                    key={i}
                    cx={toScatterX(pt.x)}
                    cy={toPxY(pt.y)}
                    r={hoverScatter === pt ? 6 : 4}
                    fill="#35C99A"
                    fillOpacity={0.78}
                    stroke="#07120F"
                    strokeWidth="1"
                    onMouseEnter={() => setHoverScatter(pt)}
                  />
                ))}
                {[0, 0.5, 1].map((f, i) => {
                  const xv = minX + (maxX - minX) * f;
                  return (
                    <text
                      key={i}
                      x={toScatterX(xv)}
                      y={padT + plotH + 16}
                      textAnchor="middle"
                      fill="#9DB2A7"
                      fontSize="10"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {xv.toFixed(2)}
                    </text>
                  );
                })}
              </>
            ) : (
              <>
                {/* X-axis tick labels */}
                {xTickIndices.map((idx) => (
                  <text
                    key={idx}
                    x={toPxX(idx)}
                    y={padT + plotH + 16}
                    textAnchor="middle"
                    fill="#9DB2A7"
                    fontSize="10"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {visibleLabels[idx]?.slice(0, 10)}
                  </text>
                ))}

                {/* Confidence Interval Bands */}
                {visibleSeries.map((s) => {
                  if (!s.ciLow || !s.ciHigh) return null;
                  const topPts: string[] = [];
                  const botPts: string[] = [];
                  for (let i = 0; i < visibleLabels.length; i++) {
                    const lo = s.ciLow[i];
                    const hi = s.ciHigh[i];
                    if (lo != null && hi != null && Number.isFinite(lo) && Number.isFinite(hi)) {
                      topPts.push(`${toPxX(i).toFixed(1)},${toPxY(hi).toFixed(1)}`);
                      botPts.unshift(`${toPxX(i).toFixed(1)},${toPxY(lo).toFixed(1)}`);
                    }
                  }
                  if (topPts.length < 2) return null;
                  return (
                    <polygon
                      key={`${s.id}_ci`}
                      points={[...topPts, ...botPts].join(' ')}
                      fill={s.color}
                      fillOpacity={0.14}
                    />
                  );
                })}

                {/* Bar or Line Series */}
                {visibleSeries.map((s, sIdx) => {
                  const effType = s.type ?? chartType;
                  if (effType === 'bar') {
                    const barGroupW = Math.max(4, plotW / Math.max(1, visibleLabels.length));
                    const barW = Math.max(2, Math.min(28, (barGroupW * 0.75) / Math.max(1, visibleSeries.length)));
                    const zeroY = toPxY(Math.max(minY, Math.min(maxY, 0)));
                    return (
                      <g key={s.id}>
                        {s.values.map((v, i) => {
                          if (v === null || v === undefined || !Number.isFinite(v)) return null;
                          const cx = toPxX(i) + (sIdx - (visibleSeries.length - 1) / 2) * barW;
                          const vy = toPxY(v);
                          const top = Math.min(vy, zeroY);
                          const bh = Math.max(1.5, Math.abs(zeroY - vy));
                          return (
                            <rect
                              key={i}
                              x={cx - barW / 2}
                              y={top}
                              width={barW}
                              height={bh}
                              fill={s.color}
                              fillOpacity={0.85}
                              rx="1"
                            />
                          );
                        })}
                      </g>
                    );
                  }

                  // Line segments breaking cleanly across missing null gaps
                  const segments: string[] = [];
                  let current: string[] = [];
                  s.values.forEach((v, i) => {
                    if (v !== null && v !== undefined && Number.isFinite(v)) {
                      current.push(`${current.length === 0 ? 'M' : 'L'}${toPxX(i).toFixed(1)},${toPxY(v).toFixed(1)}`);
                    } else if (current.length > 0) {
                      segments.push(current.join(' '));
                      current = [];
                    }
                  });
                  if (current.length > 0) segments.push(current.join(' '));

                  return (
                    <g key={s.id}>
                      {segments.map((d, k) => (
                        <path
                          key={k}
                          d={d}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={s.dashed ? 1.6 : 2}
                          strokeDasharray={s.dashed ? '5 4' : undefined}
                        />
                      ))}
                      {visibleLabels.length <= 36 &&
                        s.values.map((v, i) =>
                          v !== null && v !== undefined && Number.isFinite(v) ? (
                            <circle
                              key={i}
                              cx={toPxX(i)}
                              cy={toPxY(v)}
                              r={hoverIdx === i ? 4.5 : 2.3}
                              fill={s.color}
                            />
                          ) : null
                        )}
                    </g>
                  );
                })}

                {/* Anomaly / Change-Point Markers */}
                {markers.map((m, idx) => {
                  const localIdx = m.index - startIdx;
                  if (localIdx < 0 || localIdx >= visibleLabels.length) return null;
                  const mx = toPxX(localIdx);
                  return (
                    <g key={idx}>
                      <line
                        x1={mx}
                        x2={mx}
                        y1={padT}
                        y2={padT + plotH}
                        stroke={m.color}
                        strokeWidth="1.2"
                        strokeDasharray="3 3"
                      />
                      <circle cx={mx} cy={padT + 8} r="3.5" fill={m.color} />
                    </g>
                  );
                })}

                {/* Interactive Crosshair Probe */}
                {hoverIdx !== null && hoverIdx < visibleLabels.length && (
                  <line
                    x1={toPxX(hoverIdx)}
                    x2={toPxX(hoverIdx)}
                    y1={padT}
                    y2={padT + plotH}
                    stroke="#E8F2ED"
                    strokeOpacity={0.35}
                    strokeWidth="1"
                  />
                )}
              </>
            )}
          </svg>

          {/* Compact Monospace Hover HUD */}
          {chartType !== 'scatter' && hoverIdx !== null && visibleLabels[hoverIdx] && (
            <div className="mt-2 px-3 py-1.5 rounded bg-[#10251E] border border-[#9DB2A7]/20 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
              <span className="text-[#65B8D5]">{visibleLabels[hoverIdx]}</span>
              {visibleSeries.map((s) => {
                const v = s.values[hoverIdx];
                return (
                  <span key={s.id} className="text-[#E8F2ED]">
                    <span style={{ color: s.color }}>{s.label}:</span>{' '}
                    {v !== null && v !== undefined && Number.isFinite(v) ? `${v} ${unit}` : 'Missing'}
                  </span>
                );
              })}
            </div>
          )}

          {chartType === 'scatter' && hoverScatter && (
            <div className="mt-2 px-3 py-1.5 rounded bg-[#10251E] border border-[#9DB2A7]/20 flex flex-wrap items-center gap-4 text-xs font-mono">
              {hoverScatter.label && <span className="text-[#65B8D5]">{hoverScatter.label}</span>}
              <span>{xLabel}: {hoverScatter.x}</span>
              <span>{yLabel}: {hoverScatter.y}</span>
            </div>
          )}
        </div>
      )}

      {/* Provenance & Notes Footer */}
      <div className="text-[11px] text-[#9DB2A7] border-t border-[#9DB2A7]/10 pt-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <span>Source: {source}</span>
        {dataNotes && <span className="text-[#9DB2A7]/80">{dataNotes}</span>}
      </div>
    </div>
  );
};
