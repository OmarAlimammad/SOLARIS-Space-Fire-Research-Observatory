import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Shared research selection, so users don't reselect experiments on every page.
 * Persisted per tab in sessionStorage (wrapped in try/catch — it may be unavailable).
 */
const KEY = 'solaris.research.v1';
const EMPTY = { experiments: [], investigation: 'bass-ii', material: '', question: '' };

function load() {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY,
      ...parsed,
      experiments: Array.isArray(parsed.experiments) ? parsed.experiments.filter(x => typeof x === 'string').slice(0, 2) : [],
    };
  } catch { return EMPTY; }
}

const ResearchContext = createContext(null);

export function ResearchProvider({ children }) {
  const [state, setState] = useState(load);
  useEffect(() => {
    try { window.sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }, [state]);

  const toggleExperiment = useCallback((id) => setState(s => {
    const has = s.experiments.includes(id);
    const experiments = has ? s.experiments.filter(x => x !== id) : s.experiments.length >= 2 ? [s.experiments[1], id] : [...s.experiments, id];
    return { ...s, experiments };
  }), []);
  const setExperiments = useCallback((ids) => setState(s => ({ ...s, experiments: ids.filter(Boolean).slice(0, 2) })), []);
  const setInvestigation = useCallback((investigation) => setState(s => ({ ...s, investigation })), []);
  const setMaterial = useCallback((material) => setState(s => ({ ...s, material })), []);
  const setQuestion = useCallback((question) => setState(s => ({ ...s, question })), []);
  const clear = useCallback(() => setState(s => ({ ...s, experiments: [] })), []);

  const value = useMemo(() => ({ ...state, toggleExperiment, setExperiments, setInvestigation, setMaterial, setQuestion, clear }),
    [state, toggleExperiment, setExperiments, setInvestigation, setMaterial, setQuestion, clear]);
  return <ResearchContext.Provider value={value}>{children}</ResearchContext.Provider>;
}

export function useResearch() {
  const ctx = useContext(ResearchContext);
  if (!ctx) throw new Error('useResearch must be used inside <ResearchProvider>');
  return ctx;
}
