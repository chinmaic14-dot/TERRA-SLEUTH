import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface DomTranslatorProps {
  roots: Array<React.RefObject<HTMLElement | null>>;
}

interface TextMeta {
  original: string;
  applied: string | null;
}

interface AttrMeta {
  placeholderOrig?: string;
  placeholderApplied?: string | null;
  titleOrig?: string;
  titleApplied?: string | null;
}

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
  'KBD',
  'SAMP',
]);

const INVARIANT_TOKENS = new Set([
  'TERRA SLEUTH',
  'NASA',
  'NASA POWER',
  'MODIS',
  'MOD13Q1',
  'PRECTOTCORR',
  'GWETTOP',
  'GWETROOT',
  'T2M',
  'TS',
  'NDVI',
  'RH2M',
  'ALLSKY_SFC_SW_DWN',
  'EVPTRNS',
  'CSV',
  'SVG',
  'PDF',
  'OLS',
  'SMAP',
  'EONET',
  'FIRMS',
  'GIBS',
  'CMR',
  'Open-Meteo',
  'ISRIC SoilGrids v2.0',
  'N/A',
  'UTC',
  'INR',
]);

function shouldSkipCore(core: string): boolean {
  if (!core || core.length <= 1) return true;
  if (INVARIANT_TOKENS.has(core)) return true;
  if (/^https?:\/\//i.test(core)) return true;
  // Must contain at least one letter (Latin or Unicode letter)
  if (!/[a-zA-Z\u00C0-\u024F\u0400-\u1FFF\u2C00-\uD7AF]/.test(core)) return true;
  // Skip pure numbers / units / coordinates / timestamps / p-values / short codes
  if (/^[\d\s.,:;+\-*/=<>()%°'"[\]{}|~^_!?@#&/\\]+$/.test(core)) return true;
  if (/^[+-]?\d+(\.\d+)?\s*(°C|°F|°|%|mm\/day|mm|km\/h|km|hPa|m³\/m³|m|K|MW|d)?$/i.test(core)) return true;
  if (/^\d{4}-\d{2}-\d{2}(\s*(to|→|T|-)\s*\d{4}-\d{2}-\d{2})?/.test(core) && !/[a-zA-Z]{4,}/.test(core)) return true;
  if (/^[A-Z0-9_]{2,18}$/.test(core)) return true; // All-caps identifiers like PRECTOTCORR, MOD13Q1
  if (/^p\s*=\s*[\d.e-]+$/i.test(core)) return true;
  if (/^r\s*=\s*[+-]?[\d.]+$/i.test(core)) return true;
  return false;
}

function isInsideSkippedElement(node: Node | null): boolean {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.getAttribute('data-no-translate') === 'true') return true;
    if (el.classList?.contains('leaflet-container') || el.classList?.contains('gm-style')) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function splitWhitespace(raw: string): { lead: string; core: string; trail: string } {
  const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return { lead: '', core: raw, trail: '' };
  return { lead: match[1], core: match[2], trail: match[3] };
}

function loadLocalCache(langCode: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!langCode || langCode === 'en') return map;
  try {
    const raw = localStorage.getItem(`terra_sleuth_tr_v1_${langCode}`);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v) map.set(k, v);
      }
    }
  } catch {
    // Ignore storage quota or parse errors
  }
  return map;
}

function saveLocalCache(langCode: string, map: Map<string, string>) {
  if (!langCode || langCode === 'en') return;
  try {
    const entries = Array.from(map.entries()).slice(-1400);
    localStorage.setItem(`terra_sleuth_tr_v1_${langCode}`, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage errors
  }
}

export const DomTranslator: React.FC<DomTranslatorProps> = ({ roots }) => {
  const { language, setTranslating } = useLanguage();

  const textMetaRef = useRef<WeakMap<Text, TextMeta>>(new WeakMap());
  const attrMetaRef = useRef<WeakMap<Element, AttrMeta>>(new WeakMap());
  const cacheByLangRef = useRef<Map<string, Map<string, string>>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const applyingRef = useRef(false);
  const activeLangRef = useRef(language.code);
  const activeLangNameRef = useRef(language.name);

  activeLangRef.current = language.code;
  activeLangNameRef.current = language.name;

  const getLangMap = (code: string): Map<string, string> => {
    let map = cacheByLangRef.current.get(code);
    if (!map) {
      map = loadLocalCache(code);
      cacheByLangRef.current.set(code, map);
    }
    return map;
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const collectAndApply = () => {
      if (cancelled) return;
      const langCode = activeLangRef.current;
      const langName = activeLangNameRef.current;
      const langMap = getLangMap(langCode);
      const missing = new Set<string>();

      applyingRef.current = true;
      try {
        for (const rootRef of roots) {
          const root = rootRef.current;
          if (!root) continue;

          // 1. Walk Text Nodes
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode() as Text | null;
          while (node) {
            if (!isInsideSkippedElement(node)) {
              const current = node.nodeValue ?? '';
              let meta = textMetaRef.current.get(node);

              if (!meta) {
                meta = { original: current, applied: null };
                textMetaRef.current.set(node, meta);
              } else if (meta.applied !== current && current !== meta.original) {
                // React updated the underlying text content
                meta.original = current;
                meta.applied = null;
              }

              if (langCode === 'en') {
                if (meta.applied !== null && current !== meta.original) {
                  node.nodeValue = meta.original;
                }
                meta.applied = null;
              } else {
                const { lead, core, trail } = splitWhitespace(meta.original);
                if (!shouldSkipCore(core)) {
                  const translated = langMap.get(core);
                  if (translated) {
                    const nextVal = `${lead}${translated}${trail}`;
                    if (node.nodeValue !== nextVal) {
                      node.nodeValue = nextVal;
                    }
                    meta.applied = nextVal;
                  } else {
                    const flightKey = `${langCode}::${core}`;
                    if (!inFlightRef.current.has(flightKey)) {
                      missing.add(core);
                    }
                  }
                }
              }
            }
            node = walker.nextNode() as Text | null;
          }

          // 2. Walk input/textarea placeholders & titled elements
          const attrEls = root.querySelectorAll('input[placeholder], textarea[placeholder], [title]');
          attrEls.forEach((el) => {
            if (isInsideSkippedElement(el)) return;
            let aMeta = attrMetaRef.current.get(el);
            if (!aMeta) {
              aMeta = {};
              attrMetaRef.current.set(el, aMeta);
            }

            if (el.hasAttribute('placeholder')) {
              const curPh = el.getAttribute('placeholder') ?? '';
              if (aMeta.placeholderOrig === undefined) {
                aMeta.placeholderOrig = curPh;
              } else if (aMeta.placeholderApplied !== curPh && curPh !== aMeta.placeholderOrig) {
                aMeta.placeholderOrig = curPh;
                aMeta.placeholderApplied = null;
              }
              if (langCode === 'en') {
                if (aMeta.placeholderApplied && curPh !== aMeta.placeholderOrig) {
                  el.setAttribute('placeholder', aMeta.placeholderOrig);
                }
                aMeta.placeholderApplied = null;
              } else {
                const { core } = splitWhitespace(aMeta.placeholderOrig);
                if (!shouldSkipCore(core)) {
                  const tr = langMap.get(core);
                  if (tr) {
                    if (curPh !== tr) el.setAttribute('placeholder', tr);
                    aMeta.placeholderApplied = tr;
                  } else if (!inFlightRef.current.has(`${langCode}::${core}`)) {
                    missing.add(core);
                  }
                }
              }
            }

            if (el.hasAttribute('title')) {
              const curTitle = el.getAttribute('title') ?? '';
              if (aMeta.titleOrig === undefined) {
                aMeta.titleOrig = curTitle;
              } else if (aMeta.titleApplied !== curTitle && curTitle !== aMeta.titleOrig) {
                aMeta.titleOrig = curTitle;
                aMeta.titleApplied = null;
              }
              if (langCode === 'en') {
                if (aMeta.titleApplied && curTitle !== aMeta.titleOrig) {
                  el.setAttribute('title', aMeta.titleOrig);
                }
                aMeta.titleApplied = null;
              } else {
                const { core } = splitWhitespace(aMeta.titleOrig);
                if (!shouldSkipCore(core)) {
                  const tr = langMap.get(core);
                  if (tr) {
                    if (curTitle !== tr) el.setAttribute('title', tr);
                    aMeta.titleApplied = tr;
                  } else if (!inFlightRef.current.has(`${langCode}::${core}`)) {
                    missing.add(core);
                  }
                }
              }
            }
          });
        }
      } finally {
        applyingRef.current = false;
      }

      if (langCode !== 'en' && missing.size > 0) {
        const missingList = Array.from(missing);
        missingList.forEach((txt) => inFlightRef.current.add(`${langCode}::${txt}`));
        setTranslating(true);

        const CHUNK = 45;
        const batches: string[][] = [];
        for (let i = 0; i < missingList.length; i += CHUNK) {
          batches.push(missingList.slice(i, i + CHUNK));
        }

        void Promise.all(
          batches.map(async (batch) => {
            try {
              const res = await fetch('/api/assistant/translate-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  texts: batch,
                  languageCode: langCode,
                  languageName: langName,
                }),
              });
              if (!res.ok) return;
              const json = await res.json();
              const trMap: Record<string, string> = json?.translations ?? {};
              const targetMap = getLangMap(langCode);
              for (const [src, dst] of Object.entries(trMap)) {
                if (dst && typeof dst === 'string') {
                  targetMap.set(src, dst);
                }
              }
              saveLocalCache(langCode, targetMap);
            } catch {
              // Keep resilient on transient network failure
            } finally {
              batch.forEach((txt) => inFlightRef.current.delete(`${langCode}::${txt}`));
            }
          })
        ).finally(() => {
          if (!cancelled) {
            setTranslating(inFlightRef.current.size > 0);
            if (activeLangRef.current === langCode) {
              collectAndApply();
            }
          }
        });
      } else {
        setTranslating(inFlightRef.current.size > 0);
      }
    };

    const schedulePass = () => {
      if (applyingRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        collectAndApply();
      }, 60);
    };

    // Immediate pass on language change or mount
    collectAndApply();

    const observer = new MutationObserver(() => {
      if (!applyingRef.current) {
        schedulePass();
      }
    });

    for (const rootRef of roots) {
      if (rootRef.current) {
        observer.observe(rootRef.current, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [language.code, language.name]);

  return null;
};
