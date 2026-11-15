/** Simulation run ledger (from SOLARIS 5.0): server-stored runs (local server) and browser-kept runs (hosted service). */
import React, { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { api, ledger } from './api.js';
import { Btn, ErrorBox, Panel, Passport, Tag, useAsync, useExecution } from './ui.jsx';

const KIND = {
  equilibrium: ['Chemical equilibrium', 1], reactor: ['Homogeneous reactor', 1], premixed_flame: ['1-D premixed flame', 2], counterflow_flame: ['1-D counterflow flame', 2],
  flame_l3: ['2-D transient reacting flow', 3], coupled_flame: ['Onboard coupled experiment', 3], flight: ['Flight propagation', null], saturn_legacy: ['Saturn V legacy ascent', null],
};
const TONE = { completed: 'ok', failed: 'bad', non_converged: 'warn', canceled: 'warn', timed_out: 'warn' };

export default function RunLedger({ compact = false }) {
  const exec = useExecution();
  const [tick, setTick] = useState(0), [open, setOpen] = useState(null), [local, setLocal] = useState(() => ledger.list());
  const runs = useAsync(s => api.runs(s), [tick]);
  useEffect(() => { const on = () => setLocal(ledger.list()); window.addEventListener('solaris-sim-ledger', on); window.addEventListener('storage', on); return () => { window.removeEventListener('solaris-sim-ledger', on); window.removeEventListener('storage', on); }; }, []);
  const server = runs.data?.runs ?? [];
  const rows = [...local.map(r => ({ ...r, origin: 'browser' })), ...server.filter(r => !local.some(l => l.run_id === r.run_id)).map(r => ({ ...r, origin: 'server' }))]
    .sort((a, b) => String(b.created_utc).localeCompare(String(a.created_utc)));
  const offline = runs.error?.code === 'backend_unreachable' || runs.error?.code === 'simulation_unavailable';
  return <Panel title={<><History size={17} className="sim-ico" /> Simulation runs</>}
    sub="Simulation outputs, kept separate from NASA source records. Each run keeps its inputs, input hash, model, diagnostics and limitations. None is validated against a NASA experiment unless its passport says so."
    actions={<><Btn kind="ghost" small onClick={() => { setTick(t => t + 1); setLocal(ledger.list()); }}><RefreshCw size={14} /> Refresh</Btn>{!compact && <a className="s-btn s-btn-ghost s-btn-sm" href="#/scenarios">Demonstration scenarios</a>}</>}>
    {exec?.mode === 'inline' && <p className="s-muted">On the hosted service, run records are kept in this browser{local.length ? ` (${local.length})` : ''}. Clearing site data removes them; export anything you need.</p>}
    {runs.error && !offline && <ErrorBox error={runs.error} />}
    {offline && !local.length && <ErrorBox error={runs.error} />}
    {runs.loading && !local.length && <p className="s-muted" role="status">Loading runs…</p>}
    {!runs.loading && !rows.length && !(offline && !local.length) && <p className="s-muted">No simulation has been run yet. Start in the <a href="#/world">World Builder</a>, the <a href="#/flame">Flame Laboratory</a>, the <a href="#/flight">Flight Laboratory</a> or open a <a href="#/scenarios">scenario</a>.</p>}
    {!!rows.length && <div className="s-table-wrap"><table className="s-table"><thead><tr><th>Created (UTC)</th><th>Study</th><th>Label</th><th>Status</th><th>Kept in</th><th>Run ID</th><th>Record</th></tr></thead>
      <tbody>{rows.slice(0, compact ? 8 : 200).map(r => <tr key={r.run_id}><td>{String(r.created_utc ?? '').slice(0, 19).replace('T', ' ')}</td>
        <td>{KIND[r.kind]?.[0] ?? r.kind}{KIND[r.kind]?.[1] != null && <> <Tag>Level {KIND[r.kind][1]}</Tag></>}</td><td>{r.label || '—'}</td>
        <td><Tag tone={TONE[r.status]}>{String(r.status ?? '').replace('_', ' ')}</Tag></td><td>{r.origin === 'browser' ? 'This browser' : 'Server'}</td><td><code className="sim-runid">{r.run_id}</code></td>
        <td><Btn kind="ghost" small onClick={() => setOpen(open === r.run_id ? null : r.run_id)} aria-expanded={open === r.run_id}>{open === r.run_id ? 'Hide passport' : 'Passport & export'}</Btn></td></tr>)}</tbody></table></div>}
    {open && <div style={{ marginTop: 16 }}><Passport runId={open} key={open} /></div>}
  </Panel>;
}
