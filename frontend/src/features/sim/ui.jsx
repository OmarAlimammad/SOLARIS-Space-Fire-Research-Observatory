/**
 * Simulation UI kit — the SOLARIS 5.0 controls rebuilt on the live SOLARIS design system
 * (s-panel, s-field, s-btn, s-chip, ev-badge, s-alert, s-table tokens from styles/system.css).
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, FileJson, FileText, Info, RefreshCw, ShieldCheck, Table2 } from 'lucide-react';
import { PageHeader } from '../../components/ui.jsx';
import { api, exportRun, ledger, loadCapabilities, SimError, TERMINAL } from './api.js';
import './sim.css';

export const fmt = (v, d = 4) => v == null || typeof v !== 'number' || !Number.isFinite(v) ? '—'
  : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(d - 1) : Number(v.toPrecision(d)).toString();
export const STATUS_TEXT = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed', canceled: 'Canceled', timed_out: 'Timed out', non_converged: 'Not converged', submitting: 'Submitting', loading: 'Loading', rejected: 'Rejected' };

export function Page({ kicker, title, lede, aside, children }) {
  return <div className="s-page sim-page">
    <PageHeader kicker={kicker} title={title} lede={lede} aside={aside} />
    <div className="container sim-body">{children}</div>
  </div>;
}

export function Panel({ title, sub, actions, children, className = '', id, tone }) {
  return <section className={`s-panel sim-panel ${tone ? `sim-panel-${tone}` : ''} ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
    {(title || actions) && <div className="sim-panel-head">
      <div>{title && <h2 className="s-h3">{title}</h2>}{sub && <p className="s-muted">{sub}</p>}</div>
      {actions && <div className="sim-actions">{actions}</div>}
    </div>}
    {children}
  </section>;
}

/** Fidelity level badge. Level 0 = educational illustration; 1–3 = computed simulation output. */
export function Level({ level, text }) {
  const illustrative = level === 0;
  const label = typeof level === 'number' ? `Level ${level}` : String(level);
  return <span className={`ev-badge ${illustrative ? 'ev-illustration' : 'ev-simulation'}`} title="Fidelity level of this output">{label}{text ? ` · ${text}` : ''}</span>;
}
/** Evidence label for computed outputs: never a NASA measurement. */
export const SimulatedBadge = ({ children = 'Simulation output · not a NASA measurement' }) => <span className="ev-badge ev-simulation">{children}</span>;
export const Tag = ({ tone = 'neutral', children }) => <span className={`s-chip sim-chip-${tone}`}>{children}</span>;
export const Btn = ({ kind = 'primary', small, className = '', ...p }) => <button type="button" {...p} className={`s-btn s-btn-${kind} ${small ? 's-btn-sm' : ''} ${className}`} />;

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  const e = error instanceof SimError || error.code ? error : { message: String(error.message || error) };
  return <div className="s-alert is-error sim-error" role="alert"><AlertTriangle size={18} />
    <div><strong>{e.message}</strong>
      {e.field && <div>Field: <code>{e.field}</code></div>}
      {e.expected && <div>Expected: {e.expected}</div>}
      {e.recovery && <div>What to do: {e.recovery}</div>}
      {onRetry && <div style={{ marginTop: 8 }}><button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={onRetry}><RefreshCw size={14} /> Try again</button></div>}
    </div></div>;
}

export function Num({ label, unit, value, onChange, min, max, step = 'any', hint, id, disabled }) {
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => { if (Number(text) !== value) setText(String(value ?? '')); }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps
  const n = Number(text), bad = text.trim() === '' || !Number.isFinite(n) || (min != null && n < min) || (max != null && n > max);
  return <label className={`s-field sim-field ${bad ? 'is-bad' : ''}`}><span>{label}{unit && <em> [{unit}]</em>}</span>
    <input className="s-input" id={id} type="number" inputMode="decimal" step={step} value={text} disabled={disabled} aria-invalid={bad}
      onChange={e => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(v); }} />
    {bad ? <small className="sim-bad">{text.trim() === '' || !Number.isFinite(n) ? 'Enter a number.' : `Allowed range: ${min ?? '−∞'} to ${max ?? '∞'}.`}</small> : hint && <small>{hint}</small>}
  </label>;
}
export const Select = ({ label, value, onChange, options, hint, id, disabled }) => <label className="s-field sim-field"><span>{label}</span>
  <select className="s-select" id={id} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
    {options.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
  </select>{hint && <small>{hint}</small>}</label>;
export const Text = ({ label, value, onChange, hint, maxLength = 160 }) => <label className="s-field sim-field"><span>{label}</span>
  <input className="s-input" value={value} maxLength={maxLength} onChange={e => onChange(e.target.value)} />{hint && <small>{hint}</small>}</label>;
export const Check = ({ label, checked, onChange, hint }) => <label className="sim-check"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
  <span>{label}{hint && <small>{hint}</small>}</span></label>;
export const KV = ({ rows }) => <dl className="sim-kv">{rows.filter(Boolean).map(([k, v, u]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'number' ? fmt(v) : v ?? '—'}{u ? <em> {u}</em> : null}</dd></div>)}</dl>;
export const Notes = ({ title, items, tone }) => items?.length ? <div className={`sim-notes ${tone ? 'sim-notes-' + tone : ''}`}><span className="s-label">{title}</span><ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul></div> : null;
export const Banner = ({ children, tone = 'info', icon: Icon = Info }) => <div className={`s-alert ${tone === 'info' ? 'is-info' : ''} sim-banner`}><Icon size={17} /><div>{children}</div></div>;

export function Cards({ children, label }) { return <div className="sim-cards" role="group" aria-label={label}>{children}</div>; }
export function Card({ pressed, onClick, disabled, children }) {
  return <button type="button" className={`s-card is-interactive sim-card ${pressed ? 'is-selected' : ''}`} aria-pressed={!!pressed} onClick={onClick} disabled={disabled}>{children}</button>;
}

/** Composition editor: explicit sum display, explicit normalise action; never renormalises silently. */
export function CompositionEditor({ value, onChange, species, label = 'Composition', allowHumidity = false }) {
  const [check, setCheck] = useState(null), [err, setErr] = useState(null), [normInfo, setNormInfo] = useState(null);
  const total = Object.values(value.species).reduce((a, b) => a + (Number(b) || 0), 0), ok = Math.abs(total - 1) <= 1e-6;
  useEffect(() => { const c = new AbortController(); api.inspect(value, c.signal).then(setCheck).catch(e => { if (e.name !== 'AbortError') setCheck(null); }); return () => c.abort(); }, [JSON.stringify(value)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const setSp = (k, v) => { setNormInfo(null); onChange({ ...value, species: { ...value.species, [k]: v } }); };
  const unused = species.filter(s => !(s.id in value.species));
  const normalize = async () => { setErr(null); try { const r = await api.normalize(value); setNormInfo(r); onChange({ ...value, species: r.after }); } catch (e) { setErr(e); } };
  return <fieldset className="sim-comp"><legend className="s-label">{label}</legend>
    <div className="sim-row">
      <Select label="Basis" value={value.basis} onChange={b => onChange({ ...value, basis: b })} options={[['mole', 'Mole fraction'], ['volume', 'Volume fraction (ideal gas = mole)'], ['mass', 'Mass fraction']]} />
      {allowHumidity && <Select label="Humidity" value={value.humidity?.mode ?? 'none'} onChange={m => onChange({ ...value, humidity: m === 'relative_humidity' ? { mode: m, relative_humidity: value.humidity?.relative_humidity ?? 0.5 } : { mode: m } })}
        options={[['none', 'Composition as entered'], ['relative_humidity', 'Dry composition + relative humidity']]} hint="Dry basis: water vapour is added from relative humidity." />}
      {allowHumidity && value.humidity?.mode === 'relative_humidity' && <Num label="Relative humidity" unit="0–1" min={0} max={1} value={value.humidity.relative_humidity ?? 0.5} onChange={v => onChange({ ...value, humidity: { mode: 'relative_humidity', relative_humidity: v } })} />}
    </div>
    <div className="sim-species">{Object.entries(value.species).map(([k, v]) => <div key={k} className="sim-species-row">
      <Num label={`${k} — ${species.find(s => s.id === k)?.label ?? 'species'}`} value={v} min={0} max={1} onChange={x => setSp(k, x)} />
      <button type="button" className="sim-x" aria-label={`Remove ${k}`} onClick={() => { const s = { ...value.species }; delete s[k]; setNormInfo(null); onChange({ ...value, species: s }); }}>×</button></div>)}</div>
    <div className="sim-row sim-comp-foot">
      {unused.length > 0 && <label className="s-field sim-field"><span>Add species</span><select className="s-select" value="" onChange={e => e.target.value && setSp(e.target.value, 0)}><option value="">Choose…</option>{unused.map(s => <option key={s.id} value={s.id}>{s.id} — {s.label}</option>)}</select></label>}
      <div className={`sim-sum ${ok ? 'is-ok' : 'is-bad'}`} role="status">Sum = <b>{total.toFixed(6)}</b> {ok ? '✓ closes to 1' : `(residual ${(total - 1).toExponential(2)})`}</div>
      {!ok && total > 0 && <Btn kind="ghost" small onClick={normalize}>Normalize to 1 (explicit)</Btn>}
    </div>
    {!ok && <p className="sim-bad">Fractions must sum to 1 within 1e-6. Values are never renormalized silently — edit them or press “Normalize”.</p>}
    {normInfo && <p className="sim-ok">Normalized: every fraction was multiplied by {fmt(normInfo.scale_factor, 6)} (sum before: {fmt(normInfo.total_before, 6)}).</p>}
    {check?.problems?.map((p, i) => <p key={i} className="sim-bad">{p.message}</p>)}
    <ErrorBox error={err} />
  </fieldset>;
}

/** Submit a run and follow it to a terminal state. Works with background jobs (polling) and hosted inline runs (record returned in the response). */
export function useRun(initialId = null) {
  const empty = { id: null, status: null, progress: null, error: null, data: null, frames: 0, local: false, started: null };
  const [state, setState] = useState(initialId ? { ...empty, id: initialId, status: 'loading' } : empty);
  const timer = useRef(null), alive = useRef(true), abort = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); abort.current?.abort(); }; }, []);
  const fromBundle = (b, local = true) => ({
    id: b.manifest.run_id, status: b.status?.status, progress: null, local,
    error: b.status?.status !== 'completed' && b.status?.reason ? { message: b.status.reason, ...(b.status.error || {}) } : null,
    data: { manifest: b.manifest, status: b.status, result: b.result, passport: b.passport }, frames: b.frames?.count ?? 0,
    reason: b.status?.reason, wall: b.status?.wall_time_s,
  });
  const poll = async id => {
    try {
      const st = await api.status(id); if (!alive.current) return;
      if (TERMINAL.includes(st.status)) {
        const data = await api.result(id).catch(() => null); if (!alive.current) return;
        setState({ ...empty, id, status: st.status, progress: st.progress, error: st.error || (st.reason && st.status !== 'completed' ? { message: st.reason } : null), data, frames: st.frames_available ?? 0, reason: st.reason, wall: st.wall_time_s });
      } else {
        setState(s => ({ ...s, id, status: st.status, progress: st.progress, frames: st.frames_available ?? 0, error: null }));
        timer.current = setTimeout(() => poll(id), 700);
      }
    } catch (e) { if (alive.current) setState(s => ({ ...s, status: 'failed', error: e })); }
  };
  const load = id => {
    clearTimeout(timer.current);
    const rec = ledger.get(id);
    if (rec) { ledger.frames(id).then(f => alive.current && setState(s => s.id === id ? { ...s, frames: f?.count ?? 0 } : s)); setState(fromBundle({ ...rec, frames: null })); return; }
    setState({ ...empty, id, status: 'loading' }); poll(id);
  };
  useEffect(() => { if (initialId) load(initialId); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return {
    ...state, busy: ['submitting', 'queued', 'running', 'loading'].includes(state.status),
    async start(body) {
      clearTimeout(timer.current); abort.current?.abort(); abort.current = new AbortController();
      setState({ ...empty, status: 'submitting', started: Date.now() });
      try {
        const r = await api.submit(body, abort.current.signal); if (!alive.current) return null;
        if (r.bundle) { ledger.save(r.bundle); setState(fromBundle(r.bundle)); return r.run_id; }
        setState(s => ({ ...s, id: r.run_id, status: r.status })); poll(r.run_id); return r.run_id;
      } catch (e) {
        if (e.name === 'AbortError') { if (alive.current) setState(s => ({ ...s, status: 'canceled', error: { message: 'Canceled in this browser. The hosted service may finish the computation, but its result is discarded.' } })); return null; }
        if (alive.current) setState(s => ({ ...s, status: 'rejected', error: e })); return null;
      }
    },
    load,
    async cancel() {
      if (state.status === 'submitting') { abort.current?.abort(); return; }
      if (state.id && !state.local) { try { await api.cancel(state.id); } catch (e) { setState(s => ({ ...s, error: e })); } }
    },
    reset() { clearTimeout(timer.current); abort.current?.abort(); setState(empty); },
  };
}

function Elapsed({ since }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  return <>{Math.round((Date.now() - since) / 1000)} s</>;
}

export function RunStatus({ run, label = 'Run', budget }) {
  if (!run.status) return null;
  const pct = Math.round(100 * (run.progress?.fraction ?? (run.status === 'completed' ? 1 : 0)));
  const tone = run.status === 'completed' ? 'ok' : ['failed', 'timed_out', 'rejected'].includes(run.status) ? 'bad' : ['non_converged', 'canceled'].includes(run.status) ? 'warn' : 'neutral';
  const inlineWait = run.status === 'submitting';
  return <div className="sim-runstatus" role="status" aria-live="polite">
    <div className="sim-row"><Tag tone={tone}>{run.status === 'rejected' ? 'Rejected before start' : STATUS_TEXT[run.status] ?? run.status}</Tag>
      {run.id && <code className="sim-runid">{run.id}</code>}
      {run.busy && <Btn kind="ghost" small onClick={run.cancel}>{inlineWait ? 'Stop waiting' : 'Cancel run'}</Btn>}
      {run.wall != null && <span className="s-muted">{fmt(run.wall, 3)} s compute time</span>}
      {run.local && <span className="s-muted">Record kept in this browser</span>}</div>
    {run.busy && !inlineWait && <div className="sim-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} progress`}>
      <i style={{ transform: `scaleX(${pct / 100})` }} /><span>{pct}%{run.progress?.info?.t != null ? ` · simulated t = ${fmt(run.progress.info.t, 3)} s` : ''}{run.progress?.info?.T_max ? ` · T max ${fmt(run.progress.info.T_max, 4)} K` : ''}</span></div>}
    {inlineWait && <div className="sim-progress is-indeterminate" role="progressbar" aria-label={`${label} in progress`}><i /><span>Computing… <Elapsed since={run.started ?? Date.now()} />{budget ? ` (hosted budget ${budget} s; no live progress on the hosted service)` : ''}</span></div>}
    {run.status === 'non_converged' && <p className="sim-warn">The solver did not converge. No result is reported as a prediction for this case{run.reason ? `: ${run.reason}` : '.'}</p>}
    {run.status === 'canceled' && <p className="sim-warn">Run canceled. Partial output is not presented as a result.</p>}
    {run.status === 'timed_out' && !run.error && <p className="sim-warn">The run exceeded its time limit and was stopped.</p>}
    <ErrorBox error={run.error} />
  </div>;
}

/** Hook: execution mode for UI copy ('jobs' | 'inline' | null while loading). */
export function useExecution() {
  const [mode, setMode] = useState(null);
  useEffect(() => { let on = true; loadCapabilities().then(c => on && setMode(c.execution ?? { mode: 'jobs' })).catch(() => on && setMode(null)); return () => { on = false; }; }, []);
  return mode;
}

function ExportButtons({ runId }) {
  const [err, setErr] = useState(null), [busy, setBusy] = useState('');
  const go = async f => { setErr(null); setBusy(f); try { await exportRun(runId, f); } catch (e) { setErr(e); } finally { setBusy(''); } };
  return <>
    <div className="sim-actions">
      <Btn kind="ghost" small onClick={() => go('zip')} disabled={!!busy}><Download size={14} /> {busy === 'zip' ? 'Preparing…' : 'Export bundle (ZIP)'}</Btn>
      <Btn kind="ghost" small onClick={() => go('md')} disabled={!!busy}><FileText size={14} /> Report (Markdown)</Btn>
      <Btn kind="ghost" small onClick={() => go('csv')} disabled={!!busy}><Table2 size={14} /> Data (CSV)</Btn>
      <Btn kind="ghost" small onClick={() => go('json')} disabled={!!busy}><FileJson size={14} /> Run record (JSON)</Btn>
    </div>
    <ErrorBox error={err} />
  </>;
}

/** Simulation Passport: provenance, assumptions, diagnostics and validation status for one run. */
export function Passport({ runId, local }) {
  const [p, setP] = useState(local ?? null), [err, setErr] = useState(null);
  useEffect(() => {
    if (local) { setP(local); return undefined; }
    if (!runId) return undefined;
    const rec = ledger.get(runId);
    if (rec?.passport) { setP(rec.passport); return undefined; }
    const c = new AbortController(); setP(null); setErr(null);
    api.passport(runId, c.signal).then(setP).catch(e => e.name !== 'AbortError' && setErr(e));
    return () => c.abort();
  }, [runId, local]);
  if (err) return <ErrorBox error={err} />;
  if (!p) return null;
  const nd = p.numerical_diagnostics || {};
  return <Panel title={<><ShieldCheck size={17} className="sim-ico" /> Simulation Passport</>} sub="Provenance and validity record for this result" className="sim-passport">
    {runId && <ExportButtons runId={runId} />}
    <div className="sim-row" style={{ margin: '12px 0' }}><Level level={p.fidelity_level === 'flight' ? 'Flight dynamics' : p.fidelity_level} /><SimulatedBadge>{p.origin}</SimulatedBadge></div>
    <KV rows={[['Run ID', <code>{p.run_id}</code>], p.experiment_id && ['Experiment ID', <code>{p.experiment_id}</code>], ['Model', p.model], ['Status', STATUS_TEXT[p.status] ?? p.status], ['Created (UTC)', p.created_utc],
      ['Input hash (SHA-256)', <code className="sim-hash">{p.input_sha256}</code>], p.software && ['Software', Object.entries(p.software).filter(([k]) => k !== 'platform').map(([k, v]) => `${k} ${v}`).join(' · ')],
      p.mechanism && ['Mechanism', typeof p.mechanism === 'string' ? p.mechanism : `${p.mechanism.label} — ${p.mechanism.source}`], p.chemistry && ['Chemistry', `${p.chemistry.model} — ${p.chemistry.source}`],
      p.applicability && ['Applicability', typeof p.applicability === 'string' ? p.applicability : JSON.stringify(p.applicability)], ['Validation status', p.validation_status]]} />
    <Notes title="Assumptions" items={p.assumptions} /><Notes title="Limitations" items={p.limitations} tone="warn" />
    {Object.keys(nd).length > 0 && <details className="sim-details"><summary>Numerical diagnostics</summary><pre>{JSON.stringify(nd, null, 1)}</pre></details>}
    {p.benchmarks?.length > 0 && <details className="sim-details" open><summary>Verification benchmarks behind this model ({p.benchmarks.filter(b => b.status === 'PASS').length}/{p.benchmarks.length} pass)</summary>
      <div className="s-table-wrap"><table className="s-table"><thead><tr><th>ID</th><th>Benchmark</th><th>Metric</th><th>Value</th><th>Tolerance</th><th>Status</th></tr></thead><tbody>{p.benchmarks.map(b => <tr key={b.id}><td><code>{b.id}</code></td><td>{b.title}<small className="sim-sub">{b.reference}</small></td><td>{b.metric}</td><td>{Array.isArray(b.value) ? b.value.map(v => fmt(v, 3)).join(', ') : fmt(b.value, 4)}</td><td>{String(b.tolerance ?? '—')}</td><td><Tag tone={b.status === 'PASS' ? 'ok' : 'bad'}>{b.status}</Tag></td></tr>)}</tbody></table></div></details>}
    {p.evidence_lineage?.length > 0 && <Notes title="Evidence lineage" items={p.evidence_lineage.map(l => typeof l === 'string' ? l : `${l.type ?? 'source'}: ${l.label ?? l.id ?? JSON.stringify(l)}`)} />}
  </Panel>;
}

export function useAsync(fn, deps) {
  const [s, set] = useState({ data: null, error: null, loading: true }), [n, setN] = useState(0);
  useEffect(() => { const c = new AbortController(); set(x => ({ ...x, loading: true, error: null })); fn(c.signal).then(d => !c.signal.aborted && set({ data: d, error: null, loading: false })).catch(e => e.name !== 'AbortError' && set({ data: null, error: e, loading: false })); return () => c.abort(); }, [...deps, n]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, retry: () => setN(x => x + 1) };
}
export function useCapabilities() { return useAsync(() => loadCapabilities(), []); }
