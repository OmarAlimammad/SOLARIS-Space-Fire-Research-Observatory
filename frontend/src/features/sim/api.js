/**
 * SOLARIS simulation API client (/api/v5), merged from SOLARIS 5.0.
 *
 * Two execution modes, reported by GET /api/v5/capabilities → execution.mode:
 *  - 'jobs'   (local server): runs are background jobs; the client polls status and reads results from the server.
 *  - 'inline' (hosted / serverless): a run executes inside the POST request and the full record comes back in
 *             `bundle`. The browser keeps that record (run ledger, passport, exports) because the server keeps none.
 * Every failure is surfaced as a SimError carrying the server's structured recovery guidance.
 */
const ROOT = (import.meta.env?.VITE_API_BASE_URL || '') + '/api/v5';
export const TERMINAL = ['completed', 'failed', 'canceled', 'timed_out', 'non_converged'];

export class SimError extends Error {
  constructor(info, status) {
    super(info?.message || 'Request failed');
    Object.assign(this, { code: info?.code ?? 'error', field: info?.field ?? null, expected: info?.expected ?? null, recovery: info?.recovery ?? null, status });
  }
}

async function request(path, { method = 'GET', body, signal, raw = false } = {}) {
  let res;
  try {
    res = await fetch(ROOT + path, { method, signal, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new SimError({ code: 'backend_unreachable', message: 'The SOLARIS simulation service is not reachable.', recovery: 'Start the API (cd backend; python -m uvicorn main:app --port 8000) and retry. The Flight Laboratory runs in your browser and keeps working.' }, 0);
  }
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.error) throw new SimError(data.error, res.status);
    const d = Array.isArray(data?.detail) ? data.detail[0] : null;
    if (res.status === 504 || res.status === 502) throw new SimError({ code: 'gateway_timeout', message: 'The hosted simulation service did not answer in time.', recovery: 'Reduce the grid or simulated duration, or run SOLARIS locally for long cases.' }, res.status);
    throw new SimError(d ? { code: 'invalid_request', message: d.msg, field: (d.loc || []).join('.') } : { code: 'http_' + res.status, message: typeof data?.detail === 'string' ? data.detail : `Request failed (${res.status})` }, res.status);
  }
  return data;
}

export const api = {
  capabilities: s => request('/capabilities', { signal: s }),
  presets: s => request('/environment/presets', { signal: s }),
  inspect: (comp, s) => request('/mixture/inspect', { method: 'POST', body: comp, signal: s }),
  normalize: comp => request('/mixture/normalize', { method: 'POST', body: comp }),
  evaluate: (env, s) => request('/environment/evaluate', { method: 'POST', body: env, signal: s }),
  profile: (environment, top_m, s) => request('/environment/profile', { method: 'POST', body: { environment, top_m, points: 120 }, signal: s }),
  submit: (body, s) => request('/runs', { method: 'POST', body, signal: s }),
  importRun: body => request('/runs/import', { method: 'POST', body }),
  runs: s => request('/runs?limit=200', { signal: s }),
  status: (id, s) => request(`/runs/${id}`, { signal: s }),
  cancel: id => request(`/runs/${id}/cancel`, { method: 'POST' }),
  result: (id, s) => request(`/runs/${id}/result`, { signal: s }),
  passport: (id, s) => request(`/runs/${id}/passport`, { signal: s }),
  frame: (id, i, fields = 'T,hrr', s) => request(`/runs/${id}/frames/${i}?fields=${fields}`, { signal: s }),
  exportUrl: (id, format = 'zip') => `${ROOT}/runs/${id}/export?format=${format}`,
  exportRecord: (record, format = 'zip') => request(`/runs/export?format=${format}`, { method: 'POST', body: record, raw: true }),
  scenarios: s => request('/scenarios', { signal: s }),
  scenario: id => request(`/scenarios/${id}`),
  saveScenario: body => request('/scenarios', { method: 'POST', body }),
};

/** Capabilities are fetched once per page load and shared (execution mode, species, mechanisms, benchmarks). */
let capsPromise = null;
export function loadCapabilities() {
  if (!capsPromise) capsPromise = api.capabilities().catch(e => { capsPromise = null; throw e; });
  return capsPromise;
}

/* ------------------------------------------------------------------ persisted selections */
const KEY = 'solaris5.';
export const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) {
    try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* storage unavailable or full: selection lasts for this page only */ }
    try { window.dispatchEvent(new CustomEvent('solaris5-store', { detail: k })); } catch { /* non-browser */ }
  },
};

export function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------------ browser run ledger (inline / hosted mode) */
const LEDGER = 'solaris.sim.ledger.v1';
const RECORD = 'solaris.sim.run.';
const memoryFrames = new Map();   // frames are large: kept for this session, and in IndexedDB when available

function readLedger() { try { return JSON.parse(localStorage.getItem(LEDGER)) || []; } catch { return []; } }
function writeLedger(list) { try { localStorage.setItem(LEDGER, JSON.stringify(list.slice(0, 100))); } catch { /* full or unavailable */ } }

const idb = {
  open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) { reject(new Error('no indexedDB')); return; }
      const r = indexedDB.open('solaris-sim', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('frames');
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  },
  async put(key, value) {
    try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction('frames', 'readwrite'); tx.objectStore('frames').put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close(); } catch { /* optional */ }
  },
  async get(key) {
    try { const db = await this.open(); const v = await new Promise((res, rej) => { const q = db.transaction('frames').objectStore('frames').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); db.close(); return v ?? null; } catch { return null; }
  },
};

export const ledger = {
  list: readLedger,
  /** Store a run record returned by the hosted service. */
  save(bundle) {
    const m = bundle.manifest, st = bundle.status || {};
    const { frames, ...rest } = bundle;
    const row = { run_id: m.run_id, kind: m.kind, label: m.label || '', created_utc: m.created_utc, status: st.status, experiment_id: m.experiment_id ?? null, origin: 'browser' };
    writeLedger([row, ...readLedger().filter(r => r.run_id !== m.run_id)]);
    try { localStorage.setItem(RECORD + m.run_id, JSON.stringify(rest)); }
    catch { try { localStorage.setItem(RECORD + m.run_id, JSON.stringify({ ...rest, result: null, result_dropped: true })); } catch { /* full */ } }
    if (frames?.items?.length) { memoryFrames.set(m.run_id, frames); idb.put(m.run_id, frames); }
    try { window.dispatchEvent(new CustomEvent('solaris-sim-ledger')); } catch { /* non-browser */ }
    return row;
  },
  get(id) { try { const v = localStorage.getItem(RECORD + id); return v ? JSON.parse(v) : null; } catch { return null; } },
  has(id) { return !!this.get(id); },
  async frames(id) {
    if (memoryFrames.has(id)) return memoryFrames.get(id);
    const f = await idb.get(id); if (f) memoryFrames.set(id, f); return f;
  },
  remove(id) { writeLedger(readLedger().filter(r => r.run_id !== id)); try { localStorage.removeItem(RECORD + id); } catch { /* ignore */ } memoryFrames.delete(id); },
};

/* ------------------------------------------------------------------ exports */
/** Export a run: server files in jobs mode, server-built files from the browser record in hosted mode, JSON always. */
export async function exportRun(runId, format) {
  const local = ledger.get(runId);
  if (format === 'json') {
    const record = local ?? await api.result(runId);
    const frames = local ? await ledger.frames(runId) : null;
    download(`${runId}.json`, JSON.stringify({ ...record, frames: frames ?? undefined }, null, 1), 'application/json');
    return;
  }
  if (!local) { window.location.assign(api.exportUrl(runId, format)); return; }
  if (local.result_dropped) throw new SimError({ code: 'record_incomplete', message: 'This browser could not keep the full result of this run (storage full).', recovery: 'Re-run the case to export it.' });
  const frames = format === 'zip' ? await ledger.frames(runId) : null;
  const res = await api.exportRecord({ manifest: local.manifest, status: local.status, result: local.result, frames }, format);
  const ext = { zip: 'zip', md: 'md', csv: 'csv' }[format];
  download(`${runId}${format === 'md' ? '_report' : format === 'csv' ? '_series' : ''}.${ext}`, await res.blob());
}
