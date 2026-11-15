import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { extractAgentOutputs } from './pipeline.ts';
import { getInvestigationById } from './db.ts';
import { translateBatchWithGemini } from './gemini.ts';
import { getOrBuildSolutionWorkspace } from './solutions.ts';

const COLORS = {
  bgDark: '#07120F',
  forest: '#10251E',
  accent: '#35C99A',
  cyan: '#65B8D5',
  earth: '#B58C5A',
  text: '#111827',
  muted: '#4B5563',
  border: '#D1D5DB',
  red: '#DC2626',
  amber: '#D97706',
  green: '#059669',
};

type ScriptKey =
  | 'Latin'
  | 'Kannada'
  | 'Devanagari'
  | 'Tamil'
  | 'Telugu'
  | 'Malayalam'
  | 'Bengali'
  | 'Gujarati'
  | 'Gurmukhi'
  | 'Oriya'
  | 'Arabic';

const NOTO_DIR = '/usr/share/fonts/truetype/noto';

const SCRIPT_FONT_FILES: Record<ScriptKey, { regular: string; bold: string }> = {
  Latin: {
    regular: `${NOTO_DIR}/NotoSans-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSans-Bold.ttf`,
  },
  Kannada: {
    regular: `${NOTO_DIR}/NotoSansKannada-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansKannada-Bold.ttf`,
  },
  Devanagari: {
    regular: `${NOTO_DIR}/NotoSansDevanagari-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansDevanagari-Bold.ttf`,
  },
  Tamil: {
    regular: `${NOTO_DIR}/NotoSansTamil-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansTamil-Bold.ttf`,
  },
  Telugu: {
    regular: `${NOTO_DIR}/NotoSansTelugu-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansTelugu-Bold.ttf`,
  },
  Malayalam: {
    regular: `${NOTO_DIR}/NotoSansMalayalam-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansMalayalam-Bold.ttf`,
  },
  Bengali: {
    regular: `${NOTO_DIR}/NotoSansBengali-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansBengali-Bold.ttf`,
  },
  Gujarati: {
    regular: `${NOTO_DIR}/NotoSansGujarati-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansGujarati-Bold.ttf`,
  },
  Gurmukhi: {
    regular: `${NOTO_DIR}/NotoSansGurmukhi-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansGurmukhi-Bold.ttf`,
  },
  Oriya: {
    regular: `${NOTO_DIR}/NotoSansOriya-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansOriya-Bold.ttf`,
  },
  Arabic: {
    regular: `${NOTO_DIR}/NotoSansArabic-Regular.ttf`,
    bold: `${NOTO_DIR}/NotoSansArabic-Bold.ttf`,
  },
};

function registerMultilingualFonts(doc: PDFKit.PDFDocument): Set<string> {
  const registered = new Set<string>();
  (Object.keys(SCRIPT_FONT_FILES) as ScriptKey[]).forEach((script) => {
    const { regular, bold } = SCRIPT_FONT_FILES[script];
    if (fs.existsSync(regular)) {
      doc.registerFont(`${script}_R`, regular);
      registered.add(`${script}_R`);
    }
    if (fs.existsSync(bold)) {
      doc.registerFont(`${script}_B`, bold);
      registered.add(`${script}_B`);
    } else if (registered.has(`${script}_R`)) {
      doc.registerFont(`${script}_B`, regular);
      registered.add(`${script}_B`);
    }
  });
  return registered;
}

function detectCharScript(cp: number): ScriptKey | 'Common' {
  if (cp >= 0x0c80 && cp <= 0x0cff) return 'Kannada';
  if (cp >= 0x0900 && cp <= 0x097f) return 'Devanagari';
  if (cp >= 0x0b80 && cp <= 0x0bff) return 'Tamil';
  if (cp >= 0x0c00 && cp <= 0x0c7f) return 'Telugu';
  if (cp >= 0x0d00 && cp <= 0x0d7f) return 'Malayalam';
  if (cp >= 0x0980 && cp <= 0x09ff) return 'Bengali';
  if (cp >= 0x0a80 && cp <= 0x0aff) return 'Gujarati';
  if (cp >= 0x0a00 && cp <= 0x0a7f) return 'Gurmukhi';
  if (cp >= 0x0b00 && cp <= 0x0b7f) return 'Oriya';
  if (cp >= 0x0600 && cp <= 0x06ff) return 'Arabic';
  if (
    cp <= 0x002f ||
    (cp >= 0x003a && cp <= 0x0040) ||
    (cp >= 0x005b && cp <= 0x0060) ||
    (cp >= 0x007b && cp <= 0x007f) ||
    (cp >= 0x2000 && cp <= 0x206f)
  ) {
    return 'Common';
  }
  return 'Latin';
}

function splitScriptRuns(text: string): { script: ScriptKey; text: string }[] {
  const input = String(text ?? '');
  if (!input) return [{ script: 'Latin', text: '' }];
  const runs: { script: ScriptKey; text: string }[] = [];
  let currentScript: ScriptKey | null = null;
  let buffer = '';

  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 32;
    const detected = detectCharScript(cp);
    const resolved: ScriptKey = detected === 'Common' ? currentScript ?? 'Latin' : detected;
    if (currentScript === null) {
      currentScript = resolved;
      buffer = ch;
    } else if (resolved === currentScript) {
      buffer += ch;
    } else {
      runs.push({ script: currentScript, text: buffer });
      currentScript = resolved;
      buffer = ch;
    }
  }
  if (buffer) {
    runs.push({ script: currentScript ?? 'Latin', text: buffer });
  }
  return runs;
}

function pickFontName(registered: Set<string>, script: ScriptKey, bold: boolean): string {
  const key = `${script}_${bold ? 'B' : 'R'}`;
  if (registered.has(key)) return key;
  const latinKey = `Latin_${bold ? 'B' : 'R'}`;
  if (registered.has(latinKey)) return latinKey;
  return bold ? 'Helvetica-Bold' : 'Helvetica';
}

function writePdfText(
  doc: PDFKit.PDFDocument,
  registered: Set<string>,
  text: string,
  bold: boolean,
  options: PDFKit.Mixins.TextOptions & { x?: number; y?: number } = {}
) {
  const runs = splitScriptRuns(text);
  const { x, y, ...textOpts } = options;

  if (runs.length === 1) {
    doc.font(pickFontName(registered, runs[0].script, bold));
    if (x !== undefined && y !== undefined) {
      doc.text(runs[0].text, x, y, textOpts);
    } else {
      doc.text(runs[0].text, textOpts);
    }
    return;
  }

  runs.forEach((run, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === runs.length - 1;
    doc.font(pickFontName(registered, run.script, bold));
    const chunkOpts: PDFKit.Mixins.TextOptions = {
      ...(isFirst ? textOpts : { lineGap: textOpts.lineGap, align: textOpts.align, link: textOpts.link, underline: textOpts.underline }),
      continued: !isLast,
    };
    if (isFirst && x !== undefined && y !== undefined) {
      doc.text(run.text, x, y, chunkOpts);
    } else {
      doc.text(run.text, chunkOpts);
    }
  });
}

function drawVectorLineChart(
  doc: PDFKit.PDFDocument,
  registered: Set<string>,
  title: string,
  unit: string,
  dates: string[],
  values: (number | null)[],
  fitted: number[] | undefined,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const validPts: { idx: number; val: number }[] = [];
  values.forEach((v, i) => {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      validPts.push({ idx: i, val: v });
    }
  });
  if (validPts.length < 2) return;

  doc.save();
  doc.rect(x, y, w, h).strokeColor(COLORS.border).lineWidth(0.75).stroke();
  doc.fillColor(COLORS.text).fontSize(9);
  writePdfText(doc, registered, `${title} (${unit})`, true, { x: x + 8, y: y + 6, width: w - 16 });

  const padL = 42;
  const padR = 14;
  const padT = 24;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const px0 = x + padL;
  const py0 = y + padT;

  const allVals = validPts.map((p) => p.val).concat(fitted ?? []);
  let minV = Math.min(...allVals);
  let maxV = Math.max(...allVals);
  if (maxV === minV) {
    maxV += 1;
    minV -= 1;
  }
  const n = Math.max(2, values.length);

  doc.strokeColor('#E5E7EB').lineWidth(0.5);
  for (let g = 0; g <= 3; g++) {
    const gy = py0 + (plotH * g) / 3;
    doc.moveTo(px0, gy).lineTo(px0 + plotW, gy).stroke();
    const labelVal = maxV - ((maxV - minV) * g) / 3;
    doc.fillColor(COLORS.muted).fontSize(7);
    writePdfText(doc, registered, labelVal.toFixed(2), false, { x: x + 4, y: gy - 4, width: padL - 8, align: 'right' });
  }

  doc.strokeColor('#0F766E').lineWidth(1.3);
  validPts.forEach((pt, k) => {
    const px = px0 + (pt.idx / (n - 1)) * plotW;
    const py = py0 + (1 - (pt.val - minV) / (maxV - minV)) * plotH;
    if (k === 0) doc.moveTo(px, py);
    else doc.lineTo(px, py);
  });
  doc.stroke();

  if (fitted && fitted.length >= 2) {
    doc.strokeColor('#B45309').lineWidth(1.0).dash(3, { space: 2 });
    const firstX = px0;
    const firstY = py0 + (1 - (fitted[0] - minV) / (maxV - minV)) * plotH;
    const lastX = px0 + plotW;
    const lastY = py0 + (1 - (fitted[fitted.length - 1] - minV) / (maxV - minV)) * plotH;
    doc.moveTo(firstX, firstY).lineTo(lastX, lastY).stroke().undash();
  }

  if (dates.length > 0) {
    doc.fillColor(COLORS.muted).fontSize(7);
    writePdfText(doc, registered, dates[0], false, { x: px0, y: py0 + plotH + 5 });
    writePdfText(doc, registered, dates[dates.length - 1], false, { x: px0 + plotW - 60, y: py0 + plotH + 5, width: 60, align: 'right' });
  }
  doc.restore();
}

function addPageFooters(
  doc: PDFKit.PDFDocument,
  registered: Set<string>,
  docTitle: string,
  pageLabel: string,
  ofLabel: string
) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    if (i === 0) continue;
    doc.fontSize(8).fillColor(COLORS.muted);
    writePdfText(
      doc,
      registered,
      `TERRA SLEUTH  |  ${docTitle}  |  ${pageLabel} ${i + 1} ${ofLabel} ${range.count}`,
      false,
      {
        x: 50,
        y: doc.page.height - 35,
        width: doc.page.width - 100,
        align: 'center',
      }
    );
  }
}

async function buildTranslator(langCode: string, langName: string, texts: string[]) {
  if (!langCode || langCode === 'en') {
    return (s: string) => s;
  }
  const res = await translateBatchWithGemini({
    texts,
    languageCode: langCode,
    languageName: langName || langCode,
  });
  return (s: string) => {
    const trimmed = String(s ?? '').trim();
    return res.translations[trimmed] ?? s;
  };
}

export async function generateScientificReportPdf(
  investigationId: string,
  langCode = 'en',
  langName = 'English'
): Promise<Buffer> {
  const inv = getInvestigationById(investigationId);
  if (!inv) throw new Error('Investigation not found');
  const { outputs } = extractAgentOutputs(investigationId);
  const scout = outputs.data_scout ?? {};
  const trendOut = outputs.trend_detective ?? {};
  const geoOut = outputs.geo_intelligence ?? {};
  const relOut = outputs.relationship_analyst ?? {};
  const causeOut = outputs.cause_investigator ?? {};
  const challOut = outputs.science_challenger ?? {};
  const impOut = outputs.impact_analyst ?? {};
  const judgeOut = outputs.earth_judge ?? {};

  const datasets: any[] = scout.datasets ?? [];
  const trends: any[] = trendOut.trends ?? [];
  const locs: any[] = geoOut.locations ?? [];
  const pairs: any[] = relOut.pairs ?? [];
  const hypotheses: any[] = (causeOut.hypotheses ?? []).slice(0, 3);
  const challenges: any[] = (challOut.challenges ?? []).slice(0, 4);
  const impacts: any[] = (impOut.impacts ?? []).slice(0, 6);
  const actions: any[] = (judgeOut.recommended_actions ?? []).slice(0, 3);
  const refs: any[] = judgeOut.references ?? [];
  const verdict = String(judgeOut.verdict ?? inv.verdict ?? 'MONITOR');

  // Gather all strings for single batched SQLite-cached translation
  const stringsToTranslate: string[] = [
    'DETECT. INVESTIGATE. VERIFY. RESTORE.',
    'Autonomous Multi-Agent Earth Intelligence & Scientific Investigation Report',
    'FINAL EARTH JUDGE VERDICT',
    'Research Question',
    'Investigation Parameters & Provenance',
    'Investigation ID',
    'Category',
    'Study Area',
    'Coordinates',
    'Elevation',
    'Observation Period',
    'Generated UTC',
    'Executive Summary',
    'Study Area & Methodology',
    'NASA Datasets & Quality Validation',
    'Major Statistical Trends & Graphs',
    'Key Geographical Findings',
    'Environmental Relationships (Correlation != Causation)',
    'Three Possible Scientific Explanations (Hypotheses)',
    'Scientific Challenges, Confidence & Uncertainty',
    'Environmental & Societal Impacts',
    'Final Earth Judge Verdict & Recommended Actions',
    'References & Data Sources',
    'Scientific Investigation Report',
    'Page',
    'of',
    'Confidence',
    'Uncertainty',
    'Limitation',
    'Reasoning',
    'Evidence',
    'Hypothesis',
    'Period',
    'Res',
    'Missing',
    'Quality',
    'Latest',
    'Change',
    'Insufficient multi-variable overlap for correlation pairs.',
    'Multi-agent NASA observation retrieval + Python statistical analysis.',
    'Scientific investigation summary pending.',
    inv.research_question,
    inv.category,
    verdict,
    judgeOut.executive_summary ?? inv.summary ?? '',
    judgeOut.methodology ?? '',
    judgeOut.confidence_level ?? 'Moderate',
    judgeOut.uncertainty_statement ?? '',
    ...datasets.slice(0, 8).flatMap((d) => [d.dataset, d.mission, d.quality]),
    ...trends.map((t) => String(t.classification)),
    ...locs.map((l) => String(l.trendDirection)),
    ...pairs.slice(0, 5).map((p) => String(p.concern_level)),
    ...hypotheses.flatMap((h) => [h.cause, h.scientific_reasoning, h.supporting_evidence, h.confidence]),
    ...challenges.flatMap((c) => [c.finding, c.verdict_on_claim, c.scientific_limitations]),
    ...impacts.flatMap((im) => [im.sector, im.severity, im.environmental_evidence, im.exposure_vs_confirmed]),
    ...actions.flatMap((a) => [a.title, a.timeframe, a.rationale]),
    ...refs.map((r) => r.title),
  ];

  const tr = await buildTranslator(langCode, langName, stringsToTranslate);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const registered = registerMultilingualFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100;

    // Cover Page
    doc.rect(0, 0, doc.page.width, 220).fill(COLORS.bgDark);
    doc.fillColor(COLORS.accent).fontSize(10);
    writePdfText(doc, registered, tr('DETECT. INVESTIGATE. VERIFY. RESTORE.'), true, { x: 50, y: 54, width: W });
    doc.fillColor('#E8F2ED').fontSize(28);
    writePdfText(doc, registered, 'TERRA SLEUTH', true, { x: 50, y: 78, width: W });
    doc.fillColor('#9DB2A7').fontSize(11.5);
    writePdfText(
      doc,
      registered,
      tr('Autonomous Multi-Agent Earth Intelligence & Scientific Investigation Report'),
      false,
      { x: 50, y: 118, width: W }
    );

    doc.fillColor(COLORS.cyan).fontSize(10);
    writePdfText(doc, registered, `${tr('FINAL EARTH JUDGE VERDICT')}: ${tr(verdict)}`, true, { x: 50, y: 165, width: W });

    doc.fillColor(COLORS.text).fontSize(17);
    writePdfText(doc, registered, tr('Research Question'), true, { x: 50, y: 255, width: W });
    doc.fontSize(12.5).fillColor('#1F2937');
    writePdfText(doc, registered, tr(inv.research_question), false, { x: 50, y: 282, width: W, lineGap: 4 });

    const metaY = 365;
    doc.rect(50, metaY, W, 152).fillAndStroke('#F3F4F6', COLORS.border);
    doc.fillColor(COLORS.text).fontSize(10);
    writePdfText(doc, registered, tr('Investigation Parameters & Provenance'), true, { x: 65, y: metaY + 14, width: W - 30 });
    const metaLines = [
      `${tr('Investigation ID')}: ${inv.id}`,
      `${tr('Category')}: ${tr(inv.category)}`,
      `${tr('Study Area')}: ${[inv.district, inv.state, inv.country].filter(Boolean).join(', ')} (${inv.region_name})`,
      `${tr('Coordinates')}: ${inv.latitude.toFixed(4)}° N/S, ${inv.longitude.toFixed(4)}° E/W  |  ${tr('Elevation')}: ${inv.elevation_m ?? 'N/A'} m`,
      `${tr('Observation Period')}: ${inv.start_date} to ${inv.end_date}`,
      `${tr('Generated UTC')}: ${new Date().toISOString()}`,
    ];
    metaLines.forEach((line, idx) => {
      doc.fillColor(COLORS.muted).fontSize(9);
      writePdfText(doc, registered, line, false, { x: 65, y: metaY + 36 + idx * 18, width: W - 30 });
    });

    doc.addPage();
    const sectionHeader = (num: string, title: string) => {
      if (doc.y > doc.page.height - 130) doc.addPage();
      doc.moveDown(0.6);
      doc.fillColor('#0F766E').fontSize(12);
      writePdfText(doc, registered, `${num}. ${tr(title)}`, true, { width: W });
      doc.moveTo(50, doc.y + 2).lineTo(50 + W, doc.y + 2).strokeColor('#CBD5E1').lineWidth(0.6).stroke();
      doc.moveDown(0.5);
    };

    sectionHeader('01', 'Executive Summary');
    doc.fillColor(COLORS.text).fontSize(10);
    writePdfText(
      doc,
      registered,
      tr(judgeOut.executive_summary ?? inv.summary ?? 'Scientific investigation summary pending.'),
      false,
      { width: W, lineGap: 3 }
    );

    sectionHeader('02', 'Study Area & Methodology');
    doc.fillColor(COLORS.text).fontSize(9.5);
    writePdfText(
      doc,
      registered,
      `${tr('Study Area')}: ${judgeOut.studyArea ?? inv.region_name} (${judgeOut.coordinates ?? `${inv.latitude}, ${inv.longitude}`}).`,
      false,
      { width: W }
    );
    doc.moveDown(0.3);
    writePdfText(
      doc,
      registered,
      tr(judgeOut.methodology ?? 'Multi-agent NASA observation retrieval + Python statistical analysis.'),
      false,
      { width: W, lineGap: 2 }
    );

    sectionHeader('03', 'NASA Datasets & Quality Validation');
    datasets.slice(0, 8).forEach((d) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      doc.fillColor(COLORS.text).fontSize(9);
      writePdfText(doc, registered, `${d.variable} — ${tr(d.dataset)} (${tr(d.mission)})`, true, { width: W });
      doc.fillColor(COLORS.muted).fontSize(8.5);
      writePdfText(
        doc,
        registered,
        `${tr('Period')}: ${d.timePeriod} | ${tr('Res')}: ${d.spatialResolution} (${d.temporalResolution}) | ${tr('Missing')}: ${d.missingPct}% | ${tr('Quality')}: ${tr(d.quality)}`,
        false,
        { width: W }
      );
      doc.moveDown(0.25);
    });

    sectionHeader('04', 'Major Statistical Trends & Graphs');
    trends.forEach((t) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      doc.fillColor(COLORS.text).fontSize(9.5);
      writePdfText(doc, registered, `${t.variable} (${t.unit}): ${tr(String(t.classification))}`, true, { width: W });
      doc.fillColor(COLORS.muted).fontSize(8.5);
      writePdfText(
        doc,
        registered,
        `Initial: ${t.initial_value} -> Final: ${t.final_value} | OLS Slope: ${t.ols?.slope} (p=${t.ols?.p_value}, R²=${t.ols?.r2}) | Sen Slope: ${t.sens_slope?.slope} | MK p=${t.mann_kendall_deseasonalized?.p_modified} | Anomalies: ${t.anomalies?.anomaly_count ?? 0}`,
        false,
        { width: W }
      );
      doc.moveDown(0.2);
    });

    if (trends.length > 0) {
      if (doc.y > doc.page.height - 200) doc.addPage();
      const chartY = doc.y + 8;
      const chartW = (W - 14) / 2;
      trends.slice(0, 2).forEach((t, idx) => {
        drawVectorLineChart(
          doc,
          registered,
          t.variable,
          t.unit ?? '',
          t.dates ?? [],
          t.values ?? [],
          t.ols?.fitted,
          50 + idx * (chartW + 14),
          chartY,
          chartW,
          145
        );
      });
      doc.y = chartY + 162;
    }

    sectionHeader('05', 'Key Geographical Findings');
    locs.forEach((l) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      doc.fillColor(COLORS.text).fontSize(8.5);
      writePdfText(
        doc,
        registered,
        `• ${l.name} (${l.latitude.toFixed(3)}°, ${l.longitude.toFixed(3)}°, ${tr('Elevation')} ${l.elevation_m ?? 'N/A'} m): ${tr('Latest')} ${l.latestValue} ${l.unit}, ${tr('Change')} ${l.changeMagnitude} (${tr(l.trendDirection)})`,
        false,
        { width: W }
      );
    });

    sectionHeader('06', 'Environmental Relationships (Correlation != Causation)');
    if (pairs.length === 0) {
      doc.fillColor(COLORS.muted).fontSize(9);
      writePdfText(doc, registered, tr('Insufficient multi-variable overlap for correlation pairs.'), false, { width: W });
    } else {
      pairs.slice(0, 5).forEach((p) => {
        if (doc.y > doc.page.height - 60) doc.addPage();
        doc.fillColor(COLORS.text).fontSize(9);
        writePdfText(
          doc,
          registered,
          `• ${p.var_x} vs ${p.var_y}: Pearson r=${p.pearson_r} (p=${p.pearson_p}), Spearman rho=${p.spearman_rho}, Best Lag=${p.best_lag} (r=${p.best_lag_r}) — [${tr(p.concern_level)}]`,
          false,
          { width: W }
        );
      });
    }

    sectionHeader('07', 'Three Possible Scientific Explanations (Hypotheses)');
    hypotheses.forEach((h: any, idx: number) => {
      if (doc.y > doc.page.height - 95) doc.addPage();
      doc.fillColor(COLORS.text).fontSize(9.5);
      writePdfText(doc, registered, `${tr('Hypothesis')} ${idx + 1}: ${tr(h.cause)}`, true, { width: W });
      doc.fillColor(COLORS.muted).fontSize(8.5);
      writePdfText(doc, registered, `${tr('Reasoning')}: ${tr(h.scientific_reasoning)}`, false, { width: W });
      writePdfText(doc, registered, `${tr('Evidence')}: ${tr(h.supporting_evidence)} | ${tr('Confidence')}: ${tr(h.confidence)}`, false, { width: W });
      doc.moveDown(0.3);
    });

    sectionHeader('08', 'Scientific Challenges, Confidence & Uncertainty');
    doc.fillColor(COLORS.text).fontSize(9);
    writePdfText(
      doc,
      registered,
      `${tr('Confidence')}: ${tr(judgeOut.confidence_level ?? 'Moderate')} | ${tr('Uncertainty')}: ${tr(judgeOut.uncertainty_statement ?? '')}`,
      false,
      { width: W }
    );
    doc.moveDown(0.3);
    challenges.forEach((c: any) => {
      if (doc.y > doc.page.height - 75) doc.addPage();
      doc.fillColor(COLORS.text).fontSize(8.5);
      writePdfText(doc, registered, `• ${tr(c.finding)} — [${tr(c.verdict_on_claim)}]`, true, { width: W });
      doc.fillColor(COLORS.muted);
      writePdfText(doc, registered, `  ${tr('Limitation')}: ${tr(c.scientific_limitations)}`, false, { width: W });
    });

    sectionHeader('09', 'Environmental & Societal Impacts');
    impacts.forEach((im: any) => {
      if (doc.y > doc.page.height - 65) doc.addPage();
      doc.fillColor(COLORS.text).fontSize(8.5);
      writePdfText(
        doc,
        registered,
        `• ${tr(im.sector)} [${tr(im.severity)}]: ${tr(im.environmental_evidence)}. (${tr(im.exposure_vs_confirmed)})`,
        false,
        { width: W }
      );
    });

    sectionHeader('10', 'Final Earth Judge Verdict & Recommended Actions');
    doc.fillColor('#0F766E').fontSize(11);
    writePdfText(doc, registered, `${tr('FINAL EARTH JUDGE VERDICT')}: ${tr(verdict)}`, true, { width: W });
    doc.moveDown(0.3);
    actions.forEach((a: any, i: number) => {
      doc.fillColor(COLORS.text).fontSize(9.5);
      writePdfText(doc, registered, `${i + 1}. ${tr(a.title)} (${tr(a.timeframe)})`, true, { width: W });
      doc.fillColor(COLORS.muted).fontSize(8.5);
      writePdfText(doc, registered, `   ${tr(a.rationale)}`, false, { width: W });
      doc.moveDown(0.2);
    });

    sectionHeader('11', 'References & Data Sources');
    refs.forEach((r) => {
      if (doc.y > doc.page.height - 55) doc.addPage();
      doc.fillColor('#0369A1').fontSize(8.5);
      writePdfText(doc, registered, `• ${tr(r.title)}: ${r.url}`, false, { link: r.url, underline: true, width: W });
    });

    addPageFooters(doc, registered, tr('Scientific Investigation Report'), tr('Page'), tr('of'));
    doc.end();
  });
}

export async function generateActionPlanPdf(
  investigationId: string,
  langCode = 'en',
  langName = 'English'
): Promise<Buffer> {
  const workspace = await getOrBuildSolutionWorkspace(investigationId);
  const inv = workspace.investigation;
  const outputs = extractAgentOutputs(investigationId).outputs;
  const judgeOut = outputs.earth_judge ?? {};
  const impOut = outputs.impact_analyst ?? {};
  const verdict = String(judgeOut.verdict ?? inv.verdict ?? 'MONITOR');

  const stringsToTranslate: string[] = [
    'TERRA SLEUTH — SOLUTION CENTRE',
    'Environmental Action Plan',
    'Area',
    'Target User',
    '1. Environmental Problem & Scientific Evidence',
    '2. Three Ranked Environmental Solutions & Implementation Steps',
    '3. Verified Government Assistance Portals',
    '4. Required Documents & Procurement Resources',
    '5. Outcome Monitoring Indicators, Risks & Limitations',
    'Affected Area',
    'Observation Window',
    'Rank',
    'Scientific Basis',
    'Feasibility',
    'Sustainability',
    'Budget Guidance',
    'Department',
    'Benefits',
    'Assistance',
    'Approval is subject to official verification; not guaranteed',
    'Official Portal',
    'PREPARED',
    'PENDING',
    'Priority Sectors',
    'Page',
    'of',
    'Recommended satellite monitoring indicators: NASA POWER GWETTOP/GWETROOT (soil wetness), PRECTOTCORR (precipitation), MODIS MOD13Q1 NDVI (250 m vegetation greenness), and Land Surface Temp (TS).',
    'Post-implementation improvements may also stem from natural seasonal rainfall shifts rather than local interventions alone. Never share Aadhaar OTPs or portal passwords outside official .gov.in websites.',
    'Risks & Limitations',
    inv.research_question,
    workspace.userType,
    verdict,
    judgeOut.executive_summary ?? inv.summary ?? '',
    judgeOut.uncertainty_statement ?? 'Coarse satellite pixels cannot replace local field verification.',
    ...workspace.solutions.flatMap((sol: any) => [
      sol.title,
      sol.scientificBasis,
      sol.feasibility,
      sol.sustainability,
      sol.estimatedBudgetRange,
      ...(sol.implementationSteps ?? []),
    ]),
    ...workspace.portals.schemes.flatMap((sc: any) => [
      sc.name,
      sc.regionScope,
      sc.department,
      sc.benefits,
      sc.assistanceAmount,
    ]),
    ...workspace.checklist.map((c: any) => c.label),
    ...workspace.portals.productPlatforms.map((p: any) => p.name),
    ...(impOut.impacts ?? []).slice(0, 3).flatMap((x: any) => [x.sector, x.severity]),
  ];

  const tr = await buildTranslator(langCode, langName, stringsToTranslate);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const registered = registerMultilingualFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100;

    doc.rect(0, 0, doc.page.width, 195).fill('#0B1C17');
    doc.fillColor(COLORS.accent).fontSize(10);
    writePdfText(doc, registered, tr('TERRA SLEUTH — SOLUTION CENTRE'), true, { x: 50, y: 48, width: W });
    doc.fillColor('#E8F2ED').fontSize(23);
    writePdfText(doc, registered, tr('Environmental Action Plan'), true, { x: 50, y: 68, width: W });
    doc.fillColor('#9DB2A7').fontSize(10.5);
    writePdfText(doc, registered, tr(inv.research_question), false, { x: 50, y: 108, width: W });
    doc.fillColor(COLORS.earth).fontSize(9);
    writePdfText(
      doc,
      registered,
      `${tr('Area')}: ${[inv.district, inv.state, inv.country].filter(Boolean).join(', ')}  |  ${tr('Target User')}: ${tr(workspace.userType)}`,
      true,
      { x: 50, y: 158, width: W }
    );

    doc.y = 225;
    const sec = (title: string) => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(0.5);
      doc.fillColor('#0F766E').fontSize(12);
      writePdfText(doc, registered, tr(title), true, { width: W });
      doc.moveTo(50, doc.y + 2).lineTo(50 + W, doc.y + 2).strokeColor('#CBD5E1').lineWidth(0.6).stroke();
      doc.moveDown(0.4);
    };

    sec('1. Environmental Problem & Scientific Evidence');
    doc.fillColor(COLORS.text).fontSize(9.5);
    writePdfText(
      doc,
      registered,
      `${tr(verdict)}. ${tr(judgeOut.executive_summary ?? inv.summary ?? '')}`,
      false,
      { width: W, lineGap: 3 }
    );
    doc.moveDown(0.3);
    doc.fillColor(COLORS.muted).fontSize(8.5);
    writePdfText(
      doc,
      registered,
      `${tr('Affected Area')}: ${inv.region_name} (${inv.latitude.toFixed(4)}°, ${inv.longitude.toFixed(4)}°) | ${tr('Observation Window')}: ${inv.start_date} to ${inv.end_date}`,
      false,
      { width: W }
    );

    sec('2. Three Ranked Environmental Solutions & Implementation Steps');
    workspace.solutions.forEach((sol: any) => {
      if (doc.y > doc.page.height - 130) doc.addPage();
      doc.fillColor(COLORS.text).fontSize(10);
      writePdfText(doc, registered, `${tr('Rank')} #${sol.rank}: ${tr(sol.title)}`, true, { width: W });
      doc.fillColor(COLORS.muted).fontSize(8.5);
      writePdfText(doc, registered, `${tr('Scientific Basis')}: ${tr(sol.scientificBasis)}`, false, { width: W });
      writePdfText(doc, registered, `${tr('Feasibility')}: ${tr(sol.feasibility)} | ${tr('Sustainability')}: ${tr(sol.sustainability)}`, false, { width: W });
      writePdfText(doc, registered, `${tr('Budget Guidance')}: ${tr(sol.estimatedBudgetRange)}`, false, { width: W });
      (sol.implementationSteps ?? []).forEach((st: string, i: number) => {
        doc.fillColor('#374151').fontSize(8.5);
        writePdfText(doc, registered, `   ${i + 1}. ${tr(st)}`, false, { width: W });
      });
      doc.moveDown(0.4);
    });

    sec('3. Verified Government Assistance Portals');
    workspace.portals.schemes.forEach((sc: any) => {
      if (doc.y > doc.page.height - 90) doc.addPage();
      doc.fillColor(COLORS.text).fontSize(9.5);
      writePdfText(doc, registered, `${tr(sc.name)} (${tr(sc.regionScope)})`, true, { width: W });
      doc.fillColor(COLORS.muted).fontSize(8.5);
      writePdfText(doc, registered, `${tr('Department')}: ${tr(sc.department)} | ${tr('Benefits')}: ${tr(sc.benefits)}`, false, { width: W });
      writePdfText(
        doc,
        registered,
        `${tr('Assistance')}: ${tr(sc.assistanceAmount)} (${tr('Approval is subject to official verification; not guaranteed')})`,
        false,
        { width: W }
      );
      doc.fillColor('#0369A1');
      writePdfText(doc, registered, `${tr('Official Portal')}: ${sc.officialUrl}`, false, { link: sc.officialUrl, underline: true, width: W });
      doc.moveDown(0.25);
    });

    sec('4. Required Documents & Procurement Resources');
    workspace.checklist.forEach((item: any) => {
      doc.fillColor(COLORS.text).fontSize(8.5);
      writePdfText(
        doc,
        registered,
        `[${tr(item.prepared ? 'PREPARED' : 'PENDING')}] ${tr(item.label)}`,
        false,
        { width: W }
      );
    });
    doc.moveDown(0.3);
    workspace.portals.productPlatforms.forEach((p: any) => {
      doc.fillColor('#0369A1').fontSize(8.5);
      writePdfText(doc, registered, `• ${tr(p.name)}: ${p.purchaseUrl}`, false, { link: p.purchaseUrl, underline: true, width: W });
    });

    sec('5. Outcome Monitoring Indicators, Risks & Limitations');
    doc.fillColor(COLORS.text).fontSize(8.5);
    writePdfText(
      doc,
      registered,
      tr('Recommended satellite monitoring indicators: NASA POWER GWETTOP/GWETROOT (soil wetness), PRECTOTCORR (precipitation), MODIS MOD13Q1 NDVI (250 m vegetation greenness), and Land Surface Temp (TS).'),
      false,
      { width: W }
    );
    doc.moveDown(0.2);
    doc.fillColor(COLORS.muted);
    writePdfText(
      doc,
      registered,
      `${tr('Risks & Limitations')}: ${tr(judgeOut.uncertainty_statement ?? 'Coarse satellite pixels cannot replace local field verification.')} ${tr('Post-implementation improvements may also stem from natural seasonal rainfall shifts rather than local interventions alone. Never share Aadhaar OTPs or portal passwords outside official .gov.in websites.')}`,
      false,
      { width: W }
    );
    if ((impOut.impacts ?? []).length > 0) {
      doc.moveDown(0.2);
      writePdfText(
        doc,
        registered,
        `${tr('Priority Sectors')}: ${(impOut.impacts ?? []).slice(0, 3).map((x: any) => `${tr(x.sector)} (${tr(x.severity)})`).join('; ')}`,
        false,
        { width: W }
      );
    }

    addPageFooters(doc, registered, tr('Environmental Action Plan'), tr('Page'), tr('of'));
    doc.end();
  });
}
