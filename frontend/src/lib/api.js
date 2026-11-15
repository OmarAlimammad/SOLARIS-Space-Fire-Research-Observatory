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
