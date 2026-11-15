/** Flight Laboratory (from SOLARIS 5.0): Saturn V legacy ascent, N-body propagation with cached JPL DE441 states, finite burns, 6-DOF demonstrator. Runs in the browser. */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download, FileJson, Pause, Play, RotateCcw, Save } from 'lucide-react';
import { api, download, ledger, store } from '../features/sim/api.js';
import { Btn, Card, Cards, Check, ErrorBox, fmt, KV, Level, Notes, Num, Page, Panel, Passport, Select, SimulatedBadge } from '../features/sim/ui.jsx';
import { LinePlot } from '../features/sim/plots.jsx';
import { ScenarioBanner, useScenario } from '../features/sim/scenarios.jsx';
import FlightView from '../features/sim/FlightView.jsx';
import { DEFAULTS, runFlight, SCENARIOS } from '../flight/runner.js';
import { Ephemeris } from '../flight/core.js';
import { flightCsv, toExcerpt } from '../flight/exports.js';

const EPH_URL = `${import.meta.env.BASE_URL}ephemeris/de441_2026_2032.json`;
const FIELDS = {
  saturn_legacy: [['payloadFactor', 'Payload factor', '×', 0.3, 4, 'Multiplier on the nominal payload.'], ['throttle', 'Throttle', '×', 0.5, 1.15], ['pitchFinal', 'Final pitch-over angle', '°', 40, 100], ['windEast', 'East wind', 'm/s', -60, 60]],
  leo: [['epoch_utc', 'Epoch (UTC)'], ['altitude_km', 'Altitude', 'km', 160, 2000], ['inclination_deg', 'Inclination', '°', 0, 180], ['orbits', 'Orbits to coast', '', 0.2, 30], ['burn_dv_m_s', 'Orbit-raise burn Δv', 'm/s', 0, 300, '0 = coast only.'], ['drag', 'Atmospheric drag'], ['j2', 'Earth J2 oblateness']],
  lunar: [['epoch_utc', 'Epoch (UTC)'], ['parking_alt_km', 'Parking orbit altitude', 'km', 160, 600], ['perilune_alt_km', 'Target perilune altitude', 'km', 30, 5000], ['tli_dv_m_s', 'Translunar injection Δv', 'm/s', 3050, 3250], ['insert', 'Lunar orbit insertion burn']],
  free: [['epoch_utc', 'Epoch (UTC)'], ['body', 'Central body', ['earth', 'moon', 'mars']], ['periapsis_alt_km', 'Periapsis altitude', 'km', 20, 100000], ['apoapsis_alt_km', 'Apoapsis altitude', 'km', 20, 400000], ['inclination_deg', 'Inclination (to ICRF equator)', '°', 0, 180], ['orbits', 'Orbits to coast', '', 0.2, 20], ['burn_dv_m_s', 'Prograde burn Δv', 'm/s', 0, 5000, 'More than the vehicle carries ends the run with “insufficient propellant”.']],
  mars: [['epoch_utc', 'Departure epoch (UTC)'], ['tof_days', 'Time of flight', 'days', 120, 400, 'Single-revolution short-way Lambert arc; not an optimised launch window.']],
  sixdof: [['mass_kg', 'Mass', 'kg', 100, 1e5], ['ix', 'Inertia Ixx', 'kg·m²', 10, 1e7], ['iy', 'Inertia Iyy', 'kg·m²', 10, 1e7], ['iz', 'Inertia Izz', 'kg·m²', 10, 1e7], ['duration_s', 'Duration', 's', 10, 6000], ['wx', 'Initial ωx', 'rad/s', -2, 2], ['wy', 'Initial ωy', 'rad/s', -2, 2], ['wz', 'Initial ωz', 'rad/s', -2, 2], ['torque_n_m', 'Torque pulse (+y)', 'N·m', -500, 500], ['thrust_n', 'Thruster force', 'N', 0, 20000], ['offset_m', 'Thruster lateral offset', 'm', -2, 2]],
};
const col = (S, f) => S.map(f);

function Telemetry({ out, t, onPick }) {
  const S = out.result.samples, x = col(S, s => s.t), ev = out.result.events, P = p => ({ cursor: t, events: ev, onPick, xLabel: 'mission elapsed time [s]', aspect: 0.5, ...p });
  const sf = col(S, s => Math.hypot(...s.specific_force_body) / 9.80665);
  return <div className="sim-split">
    <LinePlot {...P({ title: 'Altitude above current central body', yLabel: 'altitude [km]', series: [{ label: 'altitude', x, y: col(S, s => s.alt / 1000) }] })} />
    <LinePlot {...P({ title: 'Speed relative to central body', yLabel: 'speed [m/s]', series: [{ label: 'speed', x, y: col(S, s => s.speed), color: '#2bb3a3' }] })} />
    <LinePlot {...P({ title: 'Sensed acceleration (specific force) — input to the onboard chamber', yLabel: '|f| [g0]', series: [{ label: 'specific force', x, y: sf, color: '#c8861a' }] })} />
    <LinePlot {...P({ title: 'Vehicle mass', yLabel: 'mass [kg]', series: [{ label: 'mass', x, y: col(S, s => s.m), color: '#154e77' }] })} />
    {out.scenario === 'saturn_legacy' && <><LinePlot {...P({ title: 'Dynamic pressure', yLabel: 'q [kPa]', series: [{ label: 'q', x, y: col(S, s => s.q_pa / 1000), color: '#6b5bd2' }] })} />
      <LinePlot {...P({ title: 'Pitch from local vertical', yLabel: 'pitch [°]', series: [{ label: 'pitch', x, y: col(S, s => s.pitch_deg), color: '#c2475b' }] })} /></>}
    {out.scenario === 'sixdof' && <><LinePlot {...P({ title: 'Body angular velocity', yLabel: 'ω [rad/s]', series: [0, 1, 2].map(i => ({ label: 'ω' + 'xyz'[i], x, y: col(S, s => s.omega_body[i]) })) })} />
      <LinePlot {...P({ title: 'Angular momentum magnitude', yLabel: '|L| [kg·m²/s]', series: [{ label: '|L|', x, y: col(S, s => s.L_mag), color: '#6b5bd2' }] })} /></>}
    {S[0].dv_thrust != null && <><LinePlot {...P({ title: 'Accumulated thrust Δv', yLabel: 'Δv [m/s]', series: [{ label: 'Δv', x, y: col(S, s => s.dv_thrust), color: '#6b5bd2' }] })} />
      <LinePlot {...P({ title: 'Osculating eccentricity', yLabel: 'e', series: [{ label: 'e', x, y: col(S, s => s.ecc), color: '#c2475b' }] })} /></>}
  </div>;
}

export default function Flight() {
  const [scn, setScn] = useState(() => store.get('flight_scenario', 'saturn_legacy')), [params, setParams] = useState(() => ({ ...DEFAULTS[store.get('flight_scenario', 'saturn_legacy')] }));
  const [out, setOut] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(null), [idx, setIdx] = useState(0), [playing, setPlaying] = useState(false), [saved, setSaved] = useState(null), [saving, setSaving] = useState(false);
  const worker = useRef(null), reqId = useRef(0), ephRef = useRef(null), meta = SCENARIOS.find(s => s.id === scn) ?? SCENARIOS[0];
  useEffect(() => () => worker.current?.terminate(), []);
  const choose = id => { setScn(id); store.set('flight_scenario', id); setParams({ ...DEFAULTS[id] }); setOut(null); setError(null); setSaved(null); setIdx(0); setPlaying(false); };
  const [scenario, closeScenario] = useScenario('flight', q => { choose(q.scenario); setParams({ ...DEFAULTS[q.scenario], ...q.params }); });
  const finish = o => { setOut(o); setIdx(0); setBusy(false); };
  const fail = e => { setError(e); setBusy(false); };
  const run = async () => {
    setBusy(true); setError(null); setOut(null); setSaved(null); setPlaying(false); const id = ++reqId.current;
    const mainThread = async () => { try { if (meta.needsEphemeris && !ephRef.current) { const r = await fetch(EPH_URL); if (!r.ok) throw { code: 'ephemeris_missing', message: `Ephemeris cache could not be loaded (${r.status}).`, recovery: 'Check that public/ephemeris/de441_2026_2032.json is served.' }; ephRef.current = new Ephemeris(await r.json()); } const t0 = performance.now(), o = runFlight(scn, params, ephRef.current); o.wall_ms = performance.now() - t0; if (id === reqId.current) finish(o); } catch (e) { if (id === reqId.current) fail({ code: e.code, message: e.message, field: e.field, recovery: e.recovery }); } };
    if (typeof Worker === 'undefined') return mainThread();
    try {
      worker.current ??= new Worker(new URL('../flight/worker.js', import.meta.url), { type: 'module' });
      worker.current.onmessage = ({ data }) => { if (data.id !== reqId.current) return; if (data.ok) finish(data.out); else fail(data.error); };
      worker.current.onerror = () => { worker.current?.terminate(); worker.current = null; mainThread(); };
      worker.current.postMessage({ id, scenario: scn, params, ephemerisUrl: new URL(EPH_URL, window.location.href).href, needsEphemeris: meta.needsEphemeris });
    } catch { mainThread(); }
    return undefined;
  };
  const cancel = () => { reqId.current++; worker.current?.terminate(); worker.current = null; setBusy(false); setError({ code: 'canceled', message: 'Flight computation canceled.' }); };
  const S = out?.result.samples ?? [], cur = S[Math.min(idx, S.length - 1)];
  useEffect(() => { if (!playing || !S.length) return undefined; const step = Math.max(1, Math.round(S.length / 400)); const t = setInterval(() => setIdx(i => { if (i >= S.length - 1) { setPlaying(false); return i; } return Math.min(S.length - 1, i + step); }), 40); return () => clearInterval(t); }, [playing, S.length]);
  const seek = t => { let lo = 0, hi = S.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (S[m].t < t) lo = m + 1; else hi = m; } setPlaying(false); setIdx(lo); };
  const slim = () => { const { views, samples, ...rest } = out.result; return { ...rest, scenario: out.scenario, vehicle: out.vehicle, plan: out.plan, summary: out.summary, limits: out.meta.limits, dof: out.meta.dof, n_samples: samples.length }; };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const kind = out.scenario === 'saturn_legacy' ? 'saturn_legacy' : 'flight';
      const result = { ...slim(), telemetry_csv: flightCsv(out.result) };
      const r = await api.importRun({ kind, label: out.meta.name, spec: { scenario: out.scenario, params: out.params, vehicle: out.vehicle.id }, result, assumptions: [...(out.result.assumptions ?? []), out.meta.limits, out.result.model].filter(Boolean) });
      if (r.bundle) ledger.save({ ...r.bundle, result });
      const excerpt = toExcerpt(out.result, { vehicle: out.vehicle.name, mission: out.meta.name, run_id: r.run_id, input: { scenario: out.scenario, params: out.params } });
      store.set('flight_excerpt', { excerpt, scenario: out.scenario, name: out.meta.name, vehicle: out.vehicle.name, summary: out.summary }); setSaved(r.run_id);
    } catch (e) { setError(e); } finally { setSaving(false); }
  };
  const F = FIELDS[scn], R = out?.result;

  return <Page kicker="Simulate / Flight Laboratory" title={<>Fly a physically modelled <em>spacecraft.</em></>}
    lede="Trajectories are integrated from equations of motion: finite burns, staging, drag, J2 and N-body gravity using cached JPL Horizons (DE441) states. The view replays the computed states; there is no hand-drawn path. Each scenario states its vehicle, degrees of freedom and limits."
    aside={<div className="sim-row"><Level level="Flight dynamics" text={meta.dof} /><SimulatedBadge>Computed in your browser</SimulatedBadge></div>}>
    <ScenarioBanner scenario={scenario} onClose={closeScenario} />
    <Panel title="1 · Choose a mission scenario">
      <Cards label="Mission scenarios">{SCENARIOS.map(s => <Card key={s.id} pressed={scn === s.id} onClick={() => choose(s.id)} disabled={busy}>
        <span className="s-chip">{s.dof}</span><strong>{s.name}</strong><span>{s.summary}</span></Card>)}</Cards>
      <p className="sim-warn" style={{ marginTop: 14 }}><b>Limits of this scenario:</b> {meta.limits}</p>
    </Panel>
    <div className="sim-grid">
      <div className="sim-stack">
        <Panel title="2 · Mission parameters" sub={`Vehicle: ${meta.vehicle.replace(/_/g, ' ')}`}>
          <div className="sim-row">{F.map(([k, label, unit, min, max, hint]) => typeof params[k] === 'boolean' ? <Check key={k} label={label} checked={params[k]} onChange={v => setParams(p => ({ ...p, [k]: v }))} />
            : Array.isArray(unit) ? <Select key={k} label={label} value={params[k]} onChange={v => setParams(p => ({ ...p, [k]: v }))} options={unit.map(o => [o, o[0].toUpperCase() + o.slice(1)])} />
            : typeof params[k] === 'string' ? <label className="s-field sim-field" key={k}><span>{label}</span><input className="s-input" value={params[k]} onChange={e => setParams(p => ({ ...p, [k]: e.target.value }))} /><small>ISO 8601 UTC. The ephemeris cache covers 2026-01-01 to 2032-01-01.</small></label>
            : <Num key={k} label={label} unit={unit} min={min} max={max} value={params[k]} onChange={v => setParams(p => ({ ...p, [k]: v }))} hint={hint} />)}</div>
          <div className="sim-actions"><Btn onClick={run} disabled={busy}>{busy ? 'Integrating trajectory…' : 'Run flight'}</Btn>{busy && <Btn kind="ghost" onClick={cancel}>Cancel</Btn>}<Btn kind="ghost" onClick={() => setParams({ ...DEFAULTS[scn] })} disabled={busy}><RotateCcw size={14} /> Reset to defaults</Btn></div>
          {busy && <p className="s-muted" role="status">Computing in a background worker. Lunar targeting runs several hundred N-body propagations and can take a few seconds.</p>}
          <ErrorBox error={error} />
        </Panel>
        {out && <Panel title="Events" sub="Located by root finding on the integrator's dense output. Click to jump.">
          <div className="sim-events">{R.events.map((e, i) => <button type="button" key={i} onClick={() => seek(e.t)}><time>T+ {fmt(e.t, 6)} s</time><span>{e.text ?? e.type}</span></button>)}</div></Panel>}
        {out && <Panel title="Model and frames"><KV rows={[['Model', R.model], ['Vehicle', `${out.vehicle.name} (${out.vehicle.classification ?? 'see provenance'})`], ['Vehicle provenance', out.vehicle.provenance], ['Inertial axes', R.frames?.axes ?? R.frames?.inertial], ['Time', R.frames?.time], ['Body frame', R.frames?.body], R.ephemeris && ['Ephemeris', `${R.ephemeris.source}; ${R.ephemeris.interpolation}`], R.numerics && ['Integrator', `rel. tol ${R.numerics.rel_tol}; ${R.numerics.steps} steps`], ['Compute time', `${fmt(out.wall_ms, 3)} ms`]]} />
          <Notes title="Not modelled" items={R.forces?.not_modelled} tone="warn" /><Notes title="Assumptions" items={R.assumptions} /></Panel>}
      </div>
      <div className="sim-stack">
        {!out && <Panel title="3 · Trajectory"><p className="s-muted">No flight computed yet. Choose a scenario and press “Run flight”.</p></Panel>}
        {out && <Panel title="3 · Trajectory" sub={`${S.length} telemetry samples · ended: ${R.ended?.reason ?? R.ended ?? 'end of plan'}`}
          actions={<><Btn kind="ghost" small onClick={() => download(`${out.scenario}_telemetry.csv`, flightCsv(R), 'text/csv')}><Download size={14} /> Telemetry CSV</Btn><Btn kind="ghost" small onClick={() => download(`${out.scenario}_flight.json`, JSON.stringify({ ...slim(), params: out.params }, null, 1), 'application/json')}><FileJson size={14} /> Run record JSON</Btn></>}>
          <FlightView result={R} index={idx} vehicleLabel={out.vehicle.name} useModel={out.scenario === 'saturn_legacy'} />
          <div className="sim-player"><Btn kind="ghost" small onClick={() => { if (idx >= S.length - 1) setIdx(0); setPlaying(p => !p); }}>{playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Replay</>}</Btn>
            <input type="range" min={0} max={S.length - 1} value={idx} onChange={e => { setPlaying(false); setIdx(Number(e.target.value)); }} aria-label="Mission time" /><span className="s-muted">T+ {fmt(cur.t, 6)} s</span></div>
          <KV rows={[['Altitude', cur.alt / 1000, 'km'], ['Speed', cur.speed, 'm/s'], ['Mass', cur.m, 'kg'], ['Sensed acceleration', Math.hypot(...cur.specific_force_body) / 9.80665, 'g0'], ['Engines', cur.burning ? 'burning' : 'off'], cur.centre && ['Central body', cur.centre], cur.periapsis_alt != null && ['Periapsis altitude', cur.periapsis_alt / 1000, 'km'], cur.apoapsis_alt != null && ['Apoapsis altitude', Number.isFinite(cur.apoapsis_alt) ? cur.apoapsis_alt / 1000 : 'open orbit', Number.isFinite(cur.apoapsis_alt) ? 'km' : '']]} />
        </Panel>}
        {out && <Panel title="Result summary" actions={<Btn small onClick={save} disabled={saving || !!saved}><Save size={14} /> {saved ? 'Saved' : saving ? 'Saving…' : 'Save run & use for onboard experiment'}</Btn>}>
          {saved && <p className="sim-ok" role="status">Stored as <code>{saved}</code>. <a href="#/onboard">Configure the onboard combustion experiment <ArrowUpRight size={12} /></a></p>}
          {R.phases?.filter(p => p.outcome === 'depletion').map(p => <p className="sim-warn" role="alert" key={p.index}><b>Insufficient propellant in “{p.label ?? p.type}”.</b> {p.note} Delivered Δv in this phase: {fmt(p.dv_thrust, 5)} m/s. Reduce the burn, or choose a vehicle with more capability.</p>)}
          {R.status && R.status !== 'completed' && <p className="sim-warn" role="alert"><b>Run status: {R.status}.</b> {R.ended?.message ?? ''}</p>}
          <KV rows={Object.entries(out.summary).filter(([, v]) => v == null || typeof v !== 'object').map(([k, v]) => [k.replace(/_/g, ' '), typeof v === 'boolean' ? (v ? 'yes' : 'no') : v ?? '—'])} />
          {R.accounting && <><h3>Mass and Δv accounting</h3><KV rows={[['Initial mass', R.accounting.initial_mass_kg, 'kg'], ['Final mass', R.accounting.final_mass_kg, 'kg'], ['Thrust Δv delivered', R.accounting.dv_thrust_m_s, 'm/s'], ['Drag loss', R.accounting.dv_drag_loss_m_s, 'm/s'], ['Ideal Δv capability of vehicle', R.accounting.ideal_dv_capability_m_s, 'm/s'], ['Propellant remaining by stage', R.accounting.propellant_remaining_kg.map(v => fmt(v, 5)).join(' / '), 'kg']]} /></>}
          {out.plan && <details className="sim-details"><summary>Trajectory plan (how the burns were targeted)</summary><pre>{JSON.stringify(out.plan, null, 1)}</pre></details>}
          {R.phases && <div className="s-table-wrap"><table className="s-table"><thead><tr><th>#</th><th>Phase</th><th>Centre</th><th>Start [s]</th><th>End [s]</th><th>Δv [m/s]</th><th>Mass end [kg]</th><th>Outcome</th></tr></thead><tbody>
            {R.phases.map(p => <tr key={p.index}><td>{p.index + 1}</td><td>{p.label ?? p.type}</td><td>{p.centre}</td><td>{fmt(p.t_start, 6)}</td><td>{fmt(p.t_end, 6)}</td><td>{fmt(p.dv_thrust, 5)}</td><td>{fmt(p.mass_end, 6)}</td><td>{p.outcome}{p.note ? ` — ${p.note}` : ''}</td></tr>)}</tbody></table></div>}
        </Panel>}
        {out && <Panel title="Telemetry" sub="Click a plot to move the time cursor. Dashed lines mark events."><Telemetry out={out} t={cur.t} onPick={seek} /></Panel>}
        {saved && <Passport runId={saved} />}
      </div>
    </div>
  </Page>;
}
