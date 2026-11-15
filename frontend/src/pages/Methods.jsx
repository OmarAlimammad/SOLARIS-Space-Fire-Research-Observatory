/** Methods & validation for the simulation laboratories (SOLARIS 5.0 capability matrix, fidelity levels, V&V benchmarks) plus the run ledger. */
import React, { useMemo } from 'react';
import { BookOpenText, ServerCog } from 'lucide-react';
import { Banner, ErrorBox, fmt, Page, Panel, Tag, useCapabilities, useExecution } from '../features/sim/ui.jsx';
import RunLedger from '../features/sim/RunLedger.jsx';
import { Skeleton } from '../components/ui.jsx';

const STATUS_CLASS = s => s.replace(/\s+/g, '-');

export default function Methods() {
  const caps = useCapabilities(), exec = useExecution();
  const c = caps.data;
  const areas = useMemo(() => {
    const out = new Map();
    for (const m of c?.matrix ?? []) { if (!out.has(m.area)) out.set(m.area, []); out.get(m.area).push(m); }
    return [...out.entries()];
  }, [c]);
  const bench = Object.entries(c?.benchmarks?.benchmarks ?? {});
  return <Page kicker="Simulate / Methods & validation" title={<>What the solvers can — and <em>cannot</em> — tell you.</>}
    lede="Every simulation in SOLARIS states its fidelity level, model, assumptions and verification. This page lists the full capability matrix, the benchmark results behind each model, and the simulation runs recorded so far.">
    <ErrorBox error={caps.error} onRetry={caps.retry} />
    {exec && <Banner icon={ServerCog}><b>{exec.mode === 'inline' ? 'Hosted execution.' : 'Server execution.'}</b> {exec.note}</Banner>}
    {caps.loading && <Panel><Skeleton lines={5} /></Panel>}
    {c && <>
      <Panel title="Fidelity levels" sub="Higher levels resolve more physics; none of them is a validated fire-safety prediction.">
        <div className="sim-levels">{c.fidelity_levels.map(l => <div key={l.level}><span className="sim-n">{l.level}</span><strong>{l.name}</strong><span className={`sim-status ${STATUS_CLASS(l.status)}`}>{l.status}</span><p>{l.summary}</p>
          {l.level === 0 && <a className="s-btn s-btn-quiet s-btn-sm" href="#/lab">Cosmic Flame Lab</a>}{(l.level === 1 || l.level === 2 || l.level === 3) && <a className="s-btn s-btn-quiet s-btn-sm" href="#/flame">Flame Laboratory</a>}</div>)}</div>
      </Panel>
      <Banner tone="warn">Generated flame fields are <b>not validated against NASA measurements</b>: the bundled NASA tables contain no matching field data. Simulation outputs are always labelled and kept apart from source records.</Banner>
      <Panel title="Capability matrix" sub="Generated from backend/sim/capabilities.py — the same data the laboratories use.">
        {areas.map(([area, rows]) => <div key={area} style={{ marginBottom: 16 }}><h3>{area}</h3>
          <div className="s-table-wrap"><table className="s-table"><thead><tr><th>Capability</th><th>Status</th><th>Limits</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.capability}><td>{r.capability}</td><td><span className={`sim-status ${STATUS_CLASS(r.status)}`}>{r.status}</span></td><td>{r.limits}</td></tr>)}</tbody></table></div></div>)}
      </Panel>
      <Panel title="Verification and validation benchmarks" sub={`Combustion suite generated ${String(c.benchmarks?.generated_utc ?? '—').slice(0, 19)} UTC; flight suite ${String(c.benchmarks?.flight_generated_utc ?? '—').slice(0, 19)} UTC. Re-run with python -m backend.sim.benchmarks and npm test.`}>
        <div className="s-table-wrap"><table className="s-table"><thead><tr><th>ID</th><th>Benchmark</th><th>Metric</th><th>Value</th><th>Acceptance</th><th>Result</th></tr></thead>
          <tbody>{bench.map(([id, b]) => <tr key={id}><td><code>{id}</code></td><td>{b.title}<small className="sim-sub">{b.reference}</small></td><td>{b.metric}</td><td>{Array.isArray(b.value) ? b.value.map(v => fmt(v, 4)).join(', ') : fmt(b.value, 4)}</td><td>{String(b.tolerance ?? '—')}</td><td><Tag tone={b.status === 'PASS' ? 'ok' : 'bad'}>{b.status}</Tag></td></tr>)}</tbody></table></div>
        <p className="s-muted" style={{ marginTop: 10 }}><BookOpenText size={13} style={{ verticalAlign: -2 }} /> Full methods, references and the verification report are in <code>docs/v5/METHODS.md</code> and <code>docs/v5/VV_REPORT.md</code> in the SOLARIS source.</p>
      </Panel>
      <Panel title="Software" sub="Versions reported by the simulation service.">
        <div className="sim-row">{Object.entries(c.versions ?? {}).filter(([k]) => k !== 'platform').map(([k, v]) => <Tag key={k}>{k} {v}</Tag>)}</div>
      </Panel>
    </>}
    <RunLedger />
  </Page>;
}
