import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { getCachedTranslations, saveCachedTranslations } from './db.ts';
import { type VerdictType } from './types.ts';

function getAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim() === '' || key === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function generateStructuredJson<T>(
  systemInstruction: string,
  prompt: string,
  responseSchema: any
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const ai = getAiClient();
  if (!ai) {
    return { ok: false, error: 'GEMINI_API_KEY is not configured in Secrets.' };
  }
  try {
    const t0 = Date.now();
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      45000,
      'Gemini structured synthesis'
    );
    const text = (response.text ?? '').trim();
    console.log(`[Gemini] generateStructuredJson completed in ${Date.now() - t0}ms (chars=${text.length})`);
    if (!text) {
      return { ok: false, error: 'Empty response from Gemini API.' };
    }
    return { ok: true, data: JSON.parse(text) as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Gemini] generateStructuredJson fallback triggered: ${msg}`);
    return { ok: false, error: msg };
  }
}

export async function runCauseInvestigatorAI(context: {
  question: string;
  category: string;
  regionLabel: string;
  period: string;
  trendsSummary: any[];
  relationshipsSummary: any[];
  datasets: string[];
}) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      hypotheses: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            cause: { type: Type.STRING },
            scientific_reasoning: { type: Type.STRING },
            supporting_evidence: { type: Type.STRING },
            relevant_datasets: { type: Type.ARRAY, items: { type: Type.STRING } },
            geographical_region: { type: Type.STRING },
            observation_period: { type: Type.STRING },
            supporting_measurements: { type: Type.STRING },
            confidence: { type: Type.STRING },
            alternative_explanations: { type: Type.STRING },
            additional_evidence_required: { type: Type.STRING },
          },
          required: [
            'cause',
            'scientific_reasoning',
            'supporting_evidence',
            'relevant_datasets',
            'geographical_region',
            'observation_period',
            'supporting_measurements',
            'confidence',
            'alternative_explanations',
            'additional_evidence_required',
          ],
        },
      },
    },
    required: ['hypotheses'],
  };

  const sys =
    'You are Agent 5 (Cause Investigator) in TERRA SLEUTH. Propose EXACTLY THREE scientifically grounded hypotheses explaining the observed environmental findings. ' +
    'CRITICAL RULES: Cite ONLY the supplied numbers and datasets. Never invent new measurements, coordinates, or statistics. ' +
    'Clearly frame every explanation as a hypothesis, never claiming proven causation from correlation alone.';

  const prompt = `Research Question: ${context.question}
Category: ${context.category}
Study Region: ${context.regionLabel}
Period: ${context.period}
Verified Datasets: ${context.datasets.join('; ')}
Python Statistical Trend Summaries:
${JSON.stringify(context.trendsSummary, null, 2)}

Python Relationship/Correlation Summaries:
${JSON.stringify(context.relationshipsSummary, null, 2)}

Return exactly 3 hypotheses ordered by scientific support.`;

  const res = await generateStructuredJson<{ hypotheses: any[] }>(sys, prompt, schema);
  if (res.ok && Array.isArray(res.data?.hypotheses) && res.data.hypotheses.length > 0) {
    return { aiPowered: true, hypotheses: res.data.hypotheses.slice(0, 3) };
  }

  // Deterministic scientific fallback when GEMINI_API_KEY is absent or fails
  const primaryTrend = context.trendsSummary[0];
  const primaryPair = context.relationshipsSummary[0];
  return {
    aiPowered: false,
    aiNote: res.ok ? 'Empty AI response' : res.error,
    hypotheses: [
      {
        cause: `Hypothesis 1: Regional hydro-climatic variability in ${primaryTrend?.variable ?? context.category}`,
        scientific_reasoning:
          'Shifts in seasonal precipitation distribution and surface energy balance alter soil moisture retention and land surface heating.',
        supporting_evidence: primaryTrend
          ? `${primaryTrend.variable} showed a ${primaryTrend.classification} pattern (slope ${primaryTrend.slope}/step, p=${primaryTrend.p_value}).`
          : 'Observed time-series variability in NASA POWER records.',
        relevant_datasets: context.datasets.slice(0, 3),
        geographical_region: context.regionLabel,
        observation_period: context.period,
        supporting_measurements: primaryTrend
          ? `Initial: ${primaryTrend.initial} ${primaryTrend.unit}, Final: ${primaryTrend.final} ${primaryTrend.unit}`
          : 'See Trend Detective data',
        confidence: 'Moderate (requires attribution modeling)',
        alternative_explanations: 'Natural multi-year climate oscillations (e.g., ENSO/IOD) or local land-use transitions.',
        additional_evidence_required: 'Multi-decadal baseline (>30 years) and local groundwater/irrigation extraction logs.',
      },
      {
        cause: 'Hypothesis 2: Land-atmosphere thermal-moisture coupling feedback',
        scientific_reasoning:
          'Reduced surface soil wetness lowers evaporative cooling, shifting net solar radiation toward sensible heat flux and elevated skin temperatures.',
        supporting_evidence: primaryPair
          ? `Observed correlation between ${primaryPair.var_x} and ${primaryPair.var_y} (r=${primaryPair.pearson_r}, p=${primaryPair.pearson_p}).`
          : 'Coupled temperature and moisture dynamics.',
        relevant_datasets: context.datasets.slice(0, 3),
        geographical_region: context.regionLabel,
        observation_period: context.period,
        supporting_measurements: primaryPair
          ? `Pearson r=${primaryPair.pearson_r}, Spearman rho=${primaryPair.spearman_rho}, best lag=${primaryPair.best_lag}`
          : 'See Relationship Analyst metrics',
        confidence: 'Moderate (correlation does not prove causation)',
        alternative_explanations: 'Cloud-cover reduction independently increasing both solar radiation and surface temperature.',
        additional_evidence_required: 'Flux tower sensible/latent heat measurements and cloud optical depth records.',
      },
      {
        cause: 'Hypothesis 3: Anthropogenic land cover, cropping intensity, or water extraction pressure',
        scientific_reasoning:
          'Changes in vegetative canopy cover, agricultural abstraction, or urban surface fraction modify local albedo, runoff, and root-zone storage.',
        supporting_evidence: 'Co-occurring spatial gradients across the monitored regional coordinates.',
        relevant_datasets: context.datasets,
        geographical_region: context.regionLabel,
        observation_period: context.period,
        supporting_measurements: 'Spatial variance across monitored sub-locations (Geo Intelligence)',
        confidence: 'Low to Moderate (indirect satellite evidence)',
        alternative_explanations: 'Topographic elevation gradients and soil texture heterogeneity.',
        additional_evidence_required: 'High-resolution 10–30m Landsat/Sentinel land-cover classification and district water withdrawal records.',
      },
    ],
  };
}

export async function runScienceChallengerAI(context: {
  question: string;
  regionLabel: string;
  period: string;
  trendsSummary: any[];
  relationshipsSummary: any[];
  hypotheses: any[];
  challengeMetrics: any;
  oppositeTrends: any[];
}) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      challenges: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            finding: { type: Type.STRING },
            evidence: { type: Type.STRING },
            reason: { type: Type.STRING },
            contradictions: { type: Type.STRING },
            cause_assessment: { type: Type.STRING },
            observation_duration: { type: Type.STRING },
            projection_and_assumptions: { type: Type.STRING },
            confidence: { type: Type.STRING },
            scientific_limitations: { type: Type.STRING },
            verdict_on_claim: { type: Type.STRING },
          },
          required: [
            'finding',
            'evidence',
            'reason',
            'contradictions',
            'cause_assessment',
            'observation_duration',
            'projection_and_assumptions',
            'confidence',
            'scientific_limitations',
            'verdict_on_claim',
          ],
        },
      },
      rejected_claims: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ['challenges', 'rejected_claims'],
  };

  const sys =
    'You are Agent 6 (Science Challenger) in TERRA SLEUTH. Your role is rigorous scientific skepticism. ' +
    'Audit every finding for missing data bias, spatial scale mismatch (0.5 deg grid vs local farms), lag-1 autocorrelation, ' +
    'short observation windows, statistical contradictions between Mann-Kendall and OLS, and unsupported causal leaps. ' +
    'Explicitly reject weak conclusions where p >= 0.05 or sample size is insufficient. Cite ONLY provided data.';

  const prompt = `Question: ${context.question}
Region: ${context.regionLabel}, Period: ${context.period}
Trends: ${JSON.stringify(context.trendsSummary)}
Relationships: ${JSON.stringify(context.relationshipsSummary)}
Opposite Trends: ${JSON.stringify(context.oppositeTrends)}
Hypotheses: ${JSON.stringify(context.hypotheses)}
Quantitative Reliability Audit: ${JSON.stringify(context.challengeMetrics)}

Provide 3–5 structured scientific challenge entries and list any weak claims that must be rejected.`;

  const res = await generateStructuredJson<{ challenges: any[]; rejected_claims: string[] }>(sys, prompt, schema);
  if (res.ok && Array.isArray(res.data?.challenges) && res.data.challenges.length > 0) {
    return { aiPowered: true, ...res.data };
  }

  const challenges = context.trendsSummary.slice(0, 4).map((t) => {
    const isWeak = t.classification === 'stable' || t.p_value >= 0.05 || t.missing_pct > 15;
    return {
      finding: `${t.variable} classified as ${t.classification}`,
      evidence: `OLS slope=${t.slope} (p=${t.p_value}), Deseasonalized MK p=${t.mk_p}, Missing=${t.missing_pct}%`,
      reason: isWeak
        ? 'Statistical significance threshold (p < 0.05) not strongly satisfied after accounting for variance/missingness.'
        : 'Both linear regression and non-parametric rank tests detect directional change, though spatial scale remains coarse.',
      contradictions:
        t.mk_significant !== (t.p_value < 0.05)
          ? 'Parametric OLS and non-parametric Mann-Kendall disagree on significance.'
          : 'No internal test contradiction detected, but coarse 0.5° grid averages out micro-watershed variance.',
      cause_assessment: 'Observational satellite/reanalysis series cannot isolate anthropogenic vs natural climate variability alone.',
      observation_duration: context.period,
      projection_and_assumptions: 'Linear continuation assumes stationarity of drivers and ignores regime shifts or ENSO reversals.',
      confidence: isWeak ? 'Low' : 'Moderate',
      scientific_limitations: '0.5°×0.625° NASA POWER grid (~55 km) does not represent individual field plots; potential autocorrelation inflation.',
      verdict_on_claim: isWeak ? 'REJECTED AS CONCLUSIVE TREND' : 'CONDITIONALLY RETAINED WITH CAVEATS',
    };
  });

  return {
    aiPowered: false,
    aiNote: res.ok ? 'Empty AI response' : res.error,
    challenges,
    rejected_claims: [
      'Any claim that correlation between variables proves direct causation is rejected.',
      'Any claim that 0.5° satellite grid averages measure individual farm-level soil moisture directly is rejected.',
    ],
  };
}

export async function runImpactAnalystAI(context: {
  question: string;
  category: string;
  regionLabel: string;
  trendsSummary: any[];
  challenges: any[];
}) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      impacts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sector: { type: Type.STRING },
            affected_area: { type: Type.STRING },
            environmental_evidence: { type: Type.STRING },
            severity: { type: Type.STRING },
            severity_score: { type: Type.NUMBER },
            exposure_vs_confirmed: { type: Type.STRING },
            time_scale: { type: Type.STRING },
            uncertainty: { type: Type.STRING },
            monitoring_requirements: { type: Type.STRING },
          },
          required: [
            'sector',
            'affected_area',
            'environmental_evidence',
            'severity',
            'severity_score',
            'exposure_vs_confirmed',
            'time_scale',
            'uncertainty',
            'monitoring_requirements',
          ],
        },
      },
    },
    required: ['impacts'],
  };

  const sys =
    'You are Agent 7 (Impact Analyst) in TERRA SLEUTH. Evaluate potential environmental and societal impacts across key sectors ' +
    '(Agriculture, Water availability, Forest ecosystems, Biodiversity, Human settlements, Infrastructure, Coastal communities, Food and livelihood security). ' +
    'Classify each strictly as "HIGH IMPACT", "MODERATE IMPACT", or "LOW / IMPROVING IMPACT" with a normalized exposure index 0–100 (representing relative analytical priority, NOT financial loss or headcount). ' +
    'CRITICAL: NEVER invent affected population counts or monetary/financial losses. Always distinguish potential exposure from confirmed ground damage.';

  const prompt = `Question: ${context.question}
Category: ${context.category}
Region: ${context.regionLabel}
Verified Trends: ${JSON.stringify(context.trendsSummary)}
Science Challenger Limitations: ${JSON.stringify(context.challenges.slice(0, 3))}

Assess 6–8 relevant sectors.`;

  const res = await generateStructuredJson<{ impacts: any[] }>(sys, prompt, schema);
  if (res.ok && Array.isArray(res.data?.impacts) && res.data.impacts.length > 0) {
    return { aiPowered: true, impacts: res.data.impacts };
  }

  const hasConcern = context.trendsSummary.some((t) => t.classification === 'decreasing' || t.classification === 'increasing');
  const sectors = [
    'Agriculture',
    'Water availability',
    'Forest ecosystems',
    'Biodiversity',
    'Human settlements',
    'Food and livelihood security',
  ];
  return {
    aiPowered: false,
    aiNote: res.ok ? 'Empty AI response' : res.error,
    impacts: sectors.map((sector, idx) => ({
      sector,
      affected_area: context.regionLabel,
      environmental_evidence: context.trendsSummary[idx % Math.max(1, context.trendsSummary.length)]
        ? `${context.trendsSummary[idx % context.trendsSummary.length].variable} (${context.trendsSummary[idx % context.trendsSummary.length].classification})`
        : 'Satellite meteorological baseline',
      severity: hasConcern && idx < 2 ? 'MODERATE IMPACT' : 'LOW / IMPROVING IMPACT',
      severity_score: hasConcern && idx < 2 ? 62 - idx * 8 : 32 + idx * 3,
      exposure_vs_confirmed: 'Potential environmental exposure identified via satellite grid; ground-level damage unconfirmed without field survey.',
      time_scale: idx < 2 ? 'Seasonal to 1–3 years' : 'Multi-year (3–10 years)',
      uncertainty: 'Moderate — dependent on local resilience, irrigation access, and socio-economic buffering.',
      monitoring_requirements: 'Continue 16-day MODIS NDVI, daily NASA POWER precipitation/soil wetness, and local station verification.',
    })),
  };
}

export async function runEarthJudgeAI(context: {
  question: string;
  regionLabel: string;
  period: string;
  datasets: string[];
  trendsSummary: any[];
  oppositeTrends: any[];
  relationshipsSummary: any[];
  hypotheses: any[];
  challenges: any[];
  impacts: any[];
}) {
  const schema = {
    type: Type.OBJECT,
    properties: {
      verdict: { type: Type.STRING },
      executive_summary: { type: Type.STRING },
      methodology: { type: Type.STRING },
      confidence_level: { type: Type.STRING },
      uncertainty_statement: { type: Type.STRING },
      recommended_actions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            rationale: { type: Type.STRING },
            timeframe: { type: Type.STRING },
          },
          required: ['title', 'rationale', 'timeframe'],
        },
      },
    },
    required: [
      'verdict',
      'executive_summary',
      'methodology',
      'confidence_level',
      'uncertainty_statement',
      'recommended_actions',
    ],
  };

  const sys =
    'You are Agent 8 (Earth Judge) in TERRA SLEUTH. Synthesize all 7 previous agents objectively. ' +
    'Select verdict strictly from: "HIGH CONCERN", "MONITOR", "IMPROVING", "INSUFFICIENT EVIDENCE". ' +
    'Base the verdict strictly on statistical significance, missing data %, challenger rejections, and impact severity. ' +
    'Provide 3 concrete, scientifically grounded recommended actions.';

  const prompt = `Question: ${context.question}
Region: ${context.regionLabel}
Period: ${context.period}
Datasets: ${context.datasets.join('; ')}
Trends: ${JSON.stringify(context.trendsSummary)}
Opposite Trends: ${JSON.stringify(context.oppositeTrends)}
Relationships: ${JSON.stringify(context.relationshipsSummary)}
Hypotheses: ${JSON.stringify(context.hypotheses)}
Challenges: ${JSON.stringify(context.challenges)}
Impacts: ${JSON.stringify(context.impacts)}

Deliver your balanced scientific assessment and verdict.`;

  const res = await generateStructuredJson<any>(sys, prompt, schema);
  if (res.ok && res.data?.verdict) {
    const allowed: VerdictType[] = ['HIGH CONCERN', 'MONITOR', 'IMPROVING', 'INSUFFICIENT EVIDENCE'];
    const v = allowed.includes(res.data.verdict) ? res.data.verdict : 'MONITOR';
    return { aiPowered: true, ...res.data, verdict: v };
  }

  // Deterministic scientific adjudication fallback
  const validTrends = context.trendsSummary.filter((t) => t.status === 'ok');
  let verdict: VerdictType = 'MONITOR';
  if (validTrends.length === 0 || validTrends.every((t) => t.missing_pct > 40)) {
    verdict = 'INSUFFICIENT EVIDENCE';
  } else {
    const highImpacts = context.impacts.filter((i) => i.severity === 'HIGH IMPACT').length;
    const sigDeclines = validTrends.filter(
      (t) =>
        (t.variable.includes('GWET') || t.variable === 'NDVI' || t.variable === 'PRECTOTCORR') &&
        t.classification === 'decreasing'
    ).length;
    const sigWarming = validTrends.filter(
      (t) => (t.variable === 'T2M' || t.variable === 'TS') && t.classification === 'increasing'
    ).length;
    const sigImproving = validTrends.filter(
      (t) =>
        (t.variable.includes('GWET') || t.variable === 'NDVI') &&
        t.classification === 'increasing'
    ).length;

    if (highImpacts >= 2 || (sigDeclines >= 1 && sigWarming >= 1)) {
      verdict = 'HIGH CONCERN';
    } else if (sigImproving >= 1 && sigDeclines === 0 && sigWarming === 0) {
      verdict = 'IMPROVING';
    } else {
      verdict = 'MONITOR';
    }
  }

  return {
    aiPowered: false,
    aiNote: res.ok ? 'Empty AI response' : res.error,
    verdict,
    executive_summary:
      `Investigation across ${context.regionLabel} (${context.period}) evaluated ${validTrends.length} environmental variables retrieved from NASA POWER and MODIS services. ` +
      `Based on Mann-Kendall tests, Sen's slope estimates, Science Challenger reliability checks, and multi-sector exposure analysis, the overall scientific verdict is ${verdict}.`,
    methodology:
      'Multi-agent pipeline: NASA CMR & POWER/MODIS ingestion -> Python OLS, Mann-Kendall (Hamed-Rao), Sen slope, Pettitt change-point, and Z-score anomaly detection -> Spatial grid sampling -> Lagged Pearson/Spearman correlation -> Adversarial reliability audit.',
    confidence_level: validTrends.length >= 2 ? 'Moderate' : 'Low',
    uncertainty_statement:
      'Coarse satellite grid resolution (~55 km for POWER, 250 m for MODIS NDVI) and seasonal autocorrelation limit localized field-scale causal inference.',
    recommended_actions: [
      {
        title: 'Deploy Soil & Water Conservation Measures',
        rationale: 'Buffer root-zone soil moisture against rainfall intermittency and surface evaporative stress.',
        timeframe: 'Immediate (0–6 months)',
      },
      {
        title: 'Establish Ground-Truth Sensor & Borewell Monitoring',
        rationale: 'Resolve 0.5° satellite grid uncertainty with localized soil moisture and piezometric measurements.',
        timeframe: 'Short-term (3–12 months)',
      },
      {
        title: 'Align Crop & Land-Cover Management with Seasonal Forecasts',
        rationale: 'Use 16-day MODIS NDVI and seasonal precipitation advisories to prevent drought exposure.',
        timeframe: 'Ongoing seasonal cycle',
      },
    ],
  };
}

export async function discoverSolutionResourcesWithSearch(params: {
  question: string;
  category: string;
  domain?: string;
  country: string;
  state: string;
  district: string;
  userType: string;
  budgetInr: number;
  verdict: string;
}) {
  const ai = getAiClient();
  let groundedText = '';
  let groundedUrls: { title: string; uri: string }[] = [];
  const scopeDomain = params.domain || params.category;

  if (ai) {
    try {
      const queryPrompt = `Find real, currently active official resources strictly tailored for:
- Implementer Role: ${params.userType}
- Focused Environmental Domain ONLY: ${scopeDomain} (Do NOT include unrelated sectors or other roles)
- Region: ${params.district}, ${params.state}, ${params.country}
- Problem Context: ${params.question} (Verdict: ${params.verdict})
- Indicative Budget: INR ${params.budgetInr}

Search and list ONLY verifiable real resources specifically for a "${params.userType}" addressing "${scopeDomain}" ONLY:
1. Recommended equipment, supplies, or instrumentation tailored to "${params.userType}" and "${scopeDomain}" within ~INR ${params.budgetInr} on official portals (ONDC, GeM, or authorised manufacturers; do NOT invent prices or stock).
2. Central & State Government Schemes specifically eligible for "${params.userType}" in "${scopeDomain}" (official .gov.in / .nic.in portals only).
3. Official educational tutorials / technical manuals specifically for "${params.userType}" in "${scopeDomain}" (including Kannada and English where relevant).
4. Verified District/State offices relevant ONLY to "${params.userType}" and "${scopeDomain}" in ${params.district}, ${params.state} (only include addresses/phones explicitly found in search; otherwise note official portal lookup).`;

      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: queryPrompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        20000,
        'Gemini Search Grounding'
      );
      groundedText = response.text ?? '';
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      groundedUrls = chunks
        .filter((c: any) => c.web?.uri)
        .map((c: any) => ({
          title: c.web.title ?? c.web.uri,
          uri: c.web.uri,
        }));
    } catch {
      // Fall back cleanly to verified role-and-domain baseline portals
    }
  }

  return {
    groundedSummary: groundedText,
    groundedUrls,
    roleScope: params.userType,
    domainScope: scopeDomain,
    searchVerifiedAt: new Date().toISOString(),
  };
}

export async function answerVoiceAssistantQuery(params: {
  question: string;
  languageName: string;
  activePage: string;
  investigationSummary?: string;
  pageContextText?: string;
}) {
  const ai = getAiClient();
  if (!ai) {
    return {
      ok: false,
      reply: `Voice Assistant is unavailable because GEMINI_API_KEY is not configured.`,
    };
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `User question: ${params.question}
Active Platform Page: ${params.activePage}
Active Investigation Summary: ${params.investigationSummary || 'None selected yet'}
Visible Page Context Excerpt: ${(params.pageContextText || '').slice(0, 3500)}

Instructions:
- Reply EXCLUSIVELY in natural, clear ${params.languageName}.
- Be concise (3–6 short spoken-friendly sentences, plain text without markdown tables or code blocks) so it sounds natural when read aloud by text-to-speech.
- Cite ONLY facts and numbers visible in the investigation/page context. If something is not observed or unavailable, state that honestly in ${params.languageName}.`,
        config: {
          systemInstruction:
            `You are the multilingual TERRA SLEUTH Voice Assistant helping users (farmers, water managers, researchers, officials) understand satellite findings, scientific challenges, and Solution Centre actions in ${params.languageName}.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
      20000,
      'Voice assistant query'
    );

    return {
      ok: true,
      reply: (response.text ?? '').trim() || 'No response generated.',
    };
  } catch (err) {
    return {
      ok: false,
      reply: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function translateTextWithGemini(params: {
  text: string;
  languageName: string;
}) {
  const ai = getAiClient();
  if (!ai || !params.text.trim()) {
    return { ok: false, translatedText: params.text };
  }
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Translate and summarize clearly into ${params.languageName} in plain spoken-friendly text (preserve numbers, units, and coordinates faithfully):\n\n${params.text.slice(0, 4000)}`,
        config: {
          systemInstruction: `You are a scientific translator translating environmental intelligence findings accurately into ${params.languageName}.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
      18000,
      'Gemini translation'
    );
    return {
      ok: true,
      translatedText: (response.text ?? '').trim() || params.text,
    };
  } catch {
    return { ok: false, translatedText: params.text };
  }
}

export async function synthesizeSpeechWavWithGemini(params: {
  text: string;
  languageName: string;
}): Promise<{ ok: boolean; audioBase64?: string; mimeType?: string; error?: string }> {
  const ai = getAiClient();
  if (!ai) {
    return { ok: false, error: 'GEMINI_API_KEY not configured' };
  }
  try {
    const cleanText = params.text.replace(/[*_`#]/g, '').trim().slice(0, 1200);
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: `Clear, warm, natural ${params.languageName} scientific voice assistant`,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      }),
      25000,
      'Gemini TTS'
    );
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return { ok: false, error: 'No audio returned by Gemini TTS' };
    }
    return {
      ok: true,
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function transcribeAudioWithGemini(params: {
  audioBase64: string;
  mimeType: string;
  languageName: string;
}): Promise<{ ok: boolean; text: string; error?: string }> {
  const ai = getAiClient();
  if (!ai) {
    return { ok: false, text: '', error: 'GEMINI_API_KEY not configured' };
  }
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: params.mimeType || 'audio/webm',
                data: params.audioBase64,
              },
            },
            {
              text: `Transcribe this spoken audio accurately. Expected language: ${params.languageName}. Return only the transcribed words.`,
            },
          ],
        },
      }),
      20000,
      'Gemini audio transcription'
    );
    return {
      ok: true,
      text: (response.text ?? '').trim(),
    };
  } catch (err) {
    return {
      ok: false,
      text: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function translateBatchWithGemini(params: {
  texts: string[];
  languageCode: string;
  languageName: string;
}): Promise<{ ok: boolean; translations: Record<string, string> }> {
  const uniqueTexts = Array.from(
    new Set(
      (params.texts ?? [])
        .map((t) => String(t ?? '').trim())
        .filter((t) => t.length > 0 && t.length <= 4000)
    )
  );

  if (uniqueTexts.length === 0 || !params.languageCode || params.languageCode === 'en') {
    const identity: Record<string, string> = {};
    for (const t of uniqueTexts) identity[t] = t;
    return { ok: true, translations: identity };
  }

  const cached = getCachedTranslations(params.languageCode, uniqueTexts);
  const missing = uniqueTexts.filter((t) => !cached[t]);
  if (missing.length === 0) {
    return { ok: true, translations: cached };
  }

  const ai = getAiClient();
  if (!ai) {
    const fallback: Record<string, string> = { ...cached };
    for (const t of missing) fallback[t] = t;
    return { ok: false, translations: fallback };
  }

  const CHUNK_SIZE = 35;
  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    chunks.push(missing.slice(i, i + CHUNK_SIZE));
  }

  const schema = {
    type: Type.OBJECT,
    properties: {
      translations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: ['translations'],
  };

  const newlyTranslated: Record<string, string> = {};

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Translate each string in the JSON array below into ${params.languageName} (${params.languageCode}). Return a JSON object {"translations": [...]} with EXACTLY ${chunk.length} strings in the exact same order.\n\nInput JSON array:\n${JSON.stringify(chunk)}`,
            config: {
              systemInstruction:
                `You are a precise multilingual UI and scientific environmental translator for TERRA SLEUTH. ` +
                `Translate every item accurately into ${params.languageName}. ` +
                `Rules: (1) Preserve exact array length and order. ` +
                `(2) Keep technical codes/identifiers intact (PRECTOTCORR, GWETTOP, GWETROOT, T2M, TS, NDVI, RH2M, ALLSKY_SFC_SW_DWN, EVPTRNS, MODIS, NASA POWER, SMAP, EONET, FIRMS, GIBS, CMR, OLS, CSV, SVG, PDF, TERRA SLEUTH), URLs, coordinates, dates, units, and numeric values intact. ` +
                `(3) Keep leading/trailing bullet symbols (●, ▲, ◌, •, →) intact if present.`,
              responseMimeType: 'application/json',
              responseSchema: schema,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            },
          }),
          22000,
          'Batch translation'
        );
        const raw = (response.text ?? '').trim();
        const parsed = JSON.parse(raw) as { translations?: unknown };
        const translationsList = Array.isArray(parsed?.translations) ? (parsed.translations as unknown[]) : null;
        if (translationsList) {
          chunk.forEach((src, idx) => {
            const tr = translationsList[idx];
            if (typeof tr === 'string' && tr.trim().length > 0) {
              newlyTranslated[src] = tr.trim();
            }
          });
        }
      } catch (err) {
        console.warn('[Gemini] translateBatch chunk failed:', err instanceof Error ? err.message : String(err));
      }
    })
  );

  saveCachedTranslations(params.languageCode, newlyTranslated);

  const merged: Record<string, string> = { ...cached, ...newlyTranslated };
  for (const t of uniqueTexts) {
    if (!merged[t]) merged[t] = t;
  }
  return { ok: true, translations: merged };
}

