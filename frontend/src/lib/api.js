import { useEffect, useState } from 'react';

const API_ROOT = import.meta.env.VITE_API_BASE_URL || '';

async function getJSON(endpoint, { signal } = {}) {
  const response = await fetch(`${API_ROOT}${endpoint}`, { signal });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(typeof detail.detail === 'string' ? detail.detail : `API request failed (${response.status})`);
  }
  return response.json();
}

async function postJSON(endpoint, body, { signal } = {}) {
  const response = await fetch(`${API_ROOT}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(typeof detail.detail === 'string' ? detail.detail : `Request failed (${response.status})`);
  }
  return response;
}

export const getMetadata = ({ signal } = {}) => getJSON('/api/metadata', { signal });
export const getExperiments = ({ search = '', offset = 0, limit = 24, signal } = {}) => {
  const params = new URLSearchParams({ search, offset: String(offset), limit: String(limit) });
  return getJSON(`/api/experiments?${params}`, { signal });
};

/** Deterministic source-metadata comparison; NOT a validated flame-risk model. */
export async function compareExperiments({ firstId, secondId, signal } = {}) {
  const response = await postJSON('/api/compatibility', { first_id: firstId, second_id: secondId }, { signal });
  return response.json();
}

export const api = {
  health: (o) => getJSON('/api/health', o),
  investigations: (o) => getJSON('/api/investigations', o),
  investigation: (id, o) => getJSON(`/api/investigations/${encodeURIComponent(id)}`, o),
  findings: (o) => getJSON('/api/findings', o),
  timeline: (o) => getJSON('/api/timeline', o),
  graph: (o) => getJSON('/api/graph', o),
  gaps: (o) => getJSON('/api/research/gaps', o),
  tensions: (concept, o) => getJSON(`/api/research/tensions?concept=${encodeURIComponent(concept)}`, o),
  transfer: (o) => getJSON('/api/research/transfer', o),
  whatIf: ({ base, change, value }, o) => getJSON(`/api/research/what-if?${new URLSearchParams({ base, change, value: value ?? '' })}`, o),
  nextExperiments: (o) => getJSON('/api/research/next-experiments', o),
  media: (id, o) => getJSON(`/api/experiments/${encodeURIComponent(id)}/media`, o),
  schema: (o) => getJSON('/api/datasets/bass-ii/schema', o),
  search: (q, o) => getJSON(`/api/search?${new URLSearchParams({ q, limit: '12' })}`, o),
  copilot: async (body, o) => (await postJSON('/api/copilot', body, o)).json(),
  report: async (body, o) => (await postJSON('/api/report', body, o)).blob(),
};

/** Small data hook: { data, error, loading, reload }. Aborts on unmount / dependency change. */
export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setState(s => ({ ...s, loading: true, error: null }));
    loader({ signal: ctrl.signal })
      .then(data => { if (!ctrl.signal.aborted) setState({ data, error: null, loading: false }); })
      .catch(error => { if (!ctrl.signal.aborted && error.name !== 'AbortError') setState({ data: null, error, loading: false }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { ...state, reload: () => setNonce(n => n + 1) };
}

export const API_HINT = 'cd backend; python -m uvicorn main:app --reload --port 8000';

/* ---------------------------------------------------------------------------
 * NASA PSI source tables (merged from SOLARIS 4.0/5.0): every experimental table in data/raw/,
 * lossless, with row locators, field schema/units, summaries and exports; plus MissionShield tools.
 * ------------------------------------------------------------------------- */
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();
export const tablesApi = {
  root: API_ROOT,
  registry: (o) => getJSON('/api/v1/datasets', o),
  dataset: (id, o) => getJSON(`/api/v1/datasets/${encodeURIComponent(id)}`, o),
  rows: (id, { search = '', filters = [], offset = 0, limit = 25 } = {}, o) => getJSON(`/api/v1/datasets/${encodeURIComponent(id)}/rows?${qs({ search, filters: JSON.stringify(filters), offset, limit })}`, o),
  row: (id, n, o) => getJSON(`/api/v1/datasets/${encodeURIComponent(id)}/rows/${n}`, o),
  summary: (id, field, { search = '', filters = [] } = {}, o) => getJSON(`/api/v1/datasets/${encodeURIComponent(id)}/summary?${qs({ field, search, filters: JSON.stringify(filters) })}`, o),
  exportUrl: (id, { search = '', filters = [] } = {}, format = 'csv') => `${API_ROOT}/api/v1/datasets/${encodeURIComponent(id)}/export?${qs({ search, filters: JSON.stringify(filters), format })}`,
  originalUrl: (id) => `${API_ROOT}/api/v1/datasets/${encodeURIComponent(id)}/original`,
  passport: (id, n, o) => getJSON(`/api/v1/mission-shield/passport/${encodeURIComponent(id)}/${n}`, o),
  coverage: (id, o) => getJSON(`/api/v1/mission-shield/coverage/${encodeURIComponent(id)}`, o),
  transport: (ventilation, steps, o) => getJSON(`/api/v1/mission-shield/transport?${qs({ ventilation, steps })}`, o),
  compare: async (body, o) => (await postJSON('/api/v1/mission-shield/compare', body, o)).json(),
  scenario: async (body, o) => (await postJSON('/api/v1/mission-shield/scenario', body, o)).json(),
  referee: async (body, o) => (await postJSON('/api/v1/mission-shield/referee/number', body, o)).json(),
};

/** Human label for a source table, e.g. "ACME · Flame Design (inverse)". */
export const tableLabel = (d) => `${d.investigation}${d.variant !== 'table' ? ` · Flame Design (${d.variant})` : ''}`;
