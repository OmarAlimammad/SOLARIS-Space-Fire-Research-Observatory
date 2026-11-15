/** Onboard experiment (from SOLARIS 5.0): one-way coupling of a computed flight to a sealed onboard combustion chamber. */
import React, { useEffect, useMemo, useState } from 'react';
import { Rocket } from 'lucide-react';
import { api, ledger, store } from '../features/sim/api.js';
import { Banner, Btn, CompositionEditor, ErrorBox, fmt, KV, Level, Notes, Num, Page, Panel, Passport, RunStatus, Select, SimulatedBadge, Tag, Text, useCapabilities, useExecution, useRun } from '../features/sim/ui.jsx';
import { LinePlot } from '../features/sim/plots.jsx';
import { ScenarioBanner, useScenario } from '../features/sim/scenarios.jsx';
import { runFlight } from '../flight/runner.js';
import { Ephemeris } from '../flight/core.js';
import { toExcerpt } from '../flight/exports.js';
import { EmptyState } from '../components/ui.jsx';
import { L3Summary, L3Viewer } from './Flame.jsx';

const AIR = { basis: 'mole', species: { N2: 0.79, O2: 0.21 }, humidity: { mode: 'none' } };
const AXES = { '+x (toward nose, along thrust)': [1, 0, 0], '−x (toward engines)': [-1, 0, 0], '+y (lateral)': [0, 1, 0], '+z (lateral)': [0, 0, 1] };

export default function Onboard() {
  const caps = useCapabilities(), exec = useExecution();
  const [, bump] = useState(0);
  const flight = store.get('flight_excerpt'), envSel = store.get('environment'), x = flight?.excerpt;
  const cabinEnv = envSel && ['spacecraft_cabin', 'sealed_chamber'].includes(envSel.kind) && envSel.pressure_pa > 0 ? envSel : null;
  const tEnd = x?.samples.at(-1).t ?? 0, firstBurn = x?.events.find(e => /cutoff|CUTOFF|burn|ignition/i.test(e.name) && e.t > 1)?.t;
  const [name, setName] = useState('Flame aboard a spacecraft'), [fuel, setFuel] = useState('CH4'), [ox, setOx] = useState(cabinEnv?.composition ?? AIR), [p, setP] = useState(cabinEnv?.pressure_pa ?? 101325), [T, setT] = useState(cabinEnv?.temperature_k ?? 295);
  const [t0, setT0] = useState(() => Math.max(0, Math.min(tEnd - 1, (firstBurn ?? 0) - 0.3))), [dur, setDur] = useState(0.6), [axis, setAxis] = useState(Object.keys(AXES)[0]), [pos, setPos] = useState([0, 0, 0]), [grid, setGrid] = useState('40x20');
  const run = useRun(store.get('onboard_run'));
  const [prep, setPrep] = useState(null), [prepErr, setPrepErr] = useState(null);
  /** A coupled scenario carries its flight definition: compute that flight here (same engine as the Flight Laboratory), store it, then set the window. */
  const applyScenario = async q => {
    setPrep('Computing the flight for this scenario…'); setPrepErr(null);
    try {
      const { scenario: sc, params } = q.flight; let eph = null;
      if (sc !== 'saturn_legacy' && sc !== 'sixdof') { const r = await fetch(`${import.meta.env.BASE_URL}ephemeris/de441_2026_2032.json`); if (!r.ok) throw { code: 'ephemeris_missing', message: 'The cached ephemeris could not be loaded.' }; eph = new Ephemeris(await r.json()); }
      const o = runFlight(sc, params, eph), { views, samples, ...rest } = o.result;
      const result = { ...rest, summary: o.summary, n_samples: samples.length };
      const saved = await api.importRun({ kind: sc === 'saturn_legacy' ? 'saturn_legacy' : 'flight', label: o.meta.name, spec: { scenario: sc, params: o.params, vehicle: o.vehicle.id }, result, assumptions: [...(o.result.assumptions ?? []), o.meta.limits].filter(Boolean) });
      if (saved.bundle) ledger.save({ ...saved.bundle, result });
      const excerpt = toExcerpt(o.result, { vehicle: o.vehicle.name, mission: o.meta.name, run_id: saved.run_id, input: { scenario: sc, params: o.params } });
      store.set('flight_excerpt', { excerpt, scenario: sc, name: o.meta.name, vehicle: o.vehicle.name, summary: o.summary });
      const ev = q.window?.event && excerpt.events.find(e => e.name.includes(q.window.event));
      if (q.window) { setDur(q.window.duration_s); setT0(Math.max(0, (ev?.t ?? q.window.start_s ?? 0) - (q.window.lead_s ?? 0))); }
      if (q.fuel) setFuel(q.fuel); if (q.axis) setAxis(q.axis); if (q.grid) setGrid(q.grid);
      run.reset(); store.set('onboard_run', null); setPrep(null); bump(n => n + 1);
    } catch (e) { setPrep(null); setPrepErr({ code: e.code, message: e.message, field: e.field, recovery: e.recovery }); }
  };
  const [scenario, closeScenario] = useScenario('coupled', applyScenario);
  useEffect(() => { if (run.id) store.set('onboard_run', run.id); }, [run.id]);
  const sf = useMemo(() => x ? x.samples.map(s => Math.hypot(...s.specific_force_body) / 9.80665) : [], [x]), ts = useMemo(() => x ? x.samples.map(s => s.t) : [], [x]);
  const windowEvents = [{ t: t0 }, { t: t0 + dur }];
  const submit = () => {
    const b = AXES[axis], lat = b[0] ? [0, 1, 0] : [1, 0, 0], [nx, ny] = grid.split('x').map(Number);
    run.start({ kind: 'coupled_flame', label: name, experiment_id: 'EXP-' + Date.now().toString(36), environment: cabinEnv ?? null,
      spec: { experiment_name: name, flight: x, window_start_s: t0, chamber: { name: 'Sealed combustion chamber', position_body_m: pos, burner_axis_body: b, lateral_axis_body: lat },
        flame: { geometry: 'axisymmetric', boundary: 'sealed', burner: { fuel: { basis: 'mole', species: { [fuel]: 1 } } }, ambient: { composition: ox, pressure_pa: p, temperature_k: T }, numerics: { nx, ny, duration_s: dur, output_interval_s: Math.max(0.005, dur / 40) } } } });
  };
  const res = run.data?.result, cp = res?.coupling, h = cp?.history ?? [], series = res?.series ?? [];
  const ftel = res?.flight?.telemetry, w0 = cp?.time_mapping?.window_start_s ?? 0;
  const inWin = arr => ftel ? ftel.t.map((t, i) => [t, arr[i]]).filter(([t]) => t >= w0 - 2 * cp.time_mapping.duration_s && t <= w0 + 3 * cp.time_mapping.duration_s) : [];
  const inline = exec?.mode === 'inline';

  return <Page kicker="Simulate / Onboard experiment" title={<>A flame <em>aboard a spacecraft.</em></>}
    lede="A sealed combustion chamber rides inside the vehicle. The acceleration the vehicle actually experiences in the computed flight (thrust, drag, free fall) is transformed into the chamber frame and drives buoyancy in the transient 2-D reacting-flow solver. Flame data and flight telemetry are stored under one experiment ID."
    aside={<div className="sim-row"><Level level={3} text="One-way coupled" /><SimulatedBadge /></div>}>
    <Banner>The chamber flame is a small laminar jet flame in cabin gas. It is unrelated to the rocket exhaust plume, which is not modelled as a flame field. Cabin composition and pressure are independent of the vacuum outside. The flight drives the chamber; the flame does not affect the vehicle.</Banner>
    <ScenarioBanner scenario={scenario} onClose={closeScenario}>{prep && <p role="status"><b>{prep}</b></p>}<ErrorBox error={prepErr} /></ScenarioBanner>
    {!x ? <Panel><EmptyState icon={Rocket} title="A computed flight is required" action={<div className="sim-actions" style={{ justifyContent: 'center' }}><a className="s-btn s-btn-primary" href="#/flight">Open Flight Laboratory</a><a className="s-btn s-btn-ghost" href="#/scenarios">Load scenario 11</a></div>}>
      No flight has been saved for coupling yet. Run a mission in the Flight Laboratory and press “Save run &amp; use for onboard experiment”, or load the onboard demonstration scenario.</EmptyState></Panel> :
    <div className="sim-grid">
      <div className="sim-stack">
        <Panel title="1 · Flight" sub={`${flight.name} — ${flight.vehicle}`} actions={<a className="s-btn s-btn-ghost s-btn-sm" href="#/flight">Change flight</a>}>
          <KV rows={[['Flight run ID', <code>{x.flight_run_id}</code>], ['Duration', tEnd, 's'], ['Samples', x.samples.length], ['Body frame', x.body_frame]]} />
          <LinePlot title="Sensed acceleration over the flight — dashed lines mark the experiment window" xLabel="mission elapsed time [s]" yLabel="|f| [g0]" aspect={0.5} series={[{ label: 'specific force', x: ts, y: sf, color: '#c8861a' }]} events={windowEvents} cursor={t0} onPick={t => setT0(Math.max(0, Math.min(tEnd - dur, t)))} />
          <p className="s-muted">Click the plot to place the start of the experiment window.</p>
          <div className="sim-events" style={{ maxHeight: 160 }}>{x.events.map((e, i) => <button type="button" key={i} onClick={() => setT0(Math.max(0, Math.min(tEnd - dur, e.t - dur / 2)))}><time>T+ {fmt(e.t, 6)} s</time><span>{e.name}</span></button>)}</div>
        </Panel>
        <Panel title="2 · Chamber and experiment window">
          <Text label="Experiment name" value={name} maxLength={100} onChange={setName} />
          <div className="sim-row"><Num label="Window start" unit="s MET" min={0} max={Math.max(0, tEnd - dur)} value={t0} onChange={setT0} /><Num label="Window length" unit="s" min={0.05} max={5} value={dur} onChange={setDur} hint="The 2-D solver resolves milliseconds; windows are short excerpts of the flight." />
            <Select label="Grid" value={grid} onChange={setGrid} options={[['40x20', '40 × 20 (fast)'], ['64x32', '64 × 32'], ['96x48', '96 × 48 (slow)']]} /></div>
          <div className="sim-row"><Select label="Burner axis points along body" value={axis} onChange={setAxis} options={Object.keys(AXES)} hint="With the burner along +x, thrust pushes hot gas toward the nose side of the chamber." />
            {[0, 1, 2].map(i => <Num key={i} label={`Chamber position ${'xyz'[i]}`} unit="m" min={-60} max={60} value={pos[i]} onChange={v => setPos(q => q.map((w, k) => k === i ? v : w))} hint={i === 0 ? 'From the centre of mass; matters only when the vehicle rotates.' : undefined} />)}</div>
          <div className="sim-row"><Select label="Fuel" value={fuel} onChange={setFuel} options={[['CH4', 'Methane (CH₄)'], ['H2', 'Hydrogen (H₂)']]} /><Num label="Chamber pressure" unit="Pa" min={10000} max={500000} value={p} onChange={setP} /><Num label="Chamber temperature" unit="K" min={250} max={400} value={T} onChange={setT} /></div>
          <CompositionEditor value={ox} onChange={setOx} species={(caps.data?.species_registry ?? []).filter(s => !['CH4', 'H2', 'CO'].includes(s.id))} label={cabinEnv ? `Chamber gas (from World Builder: ${cabinEnv.name})` : 'Chamber gas'} />
          {inline && grid !== '40x20' && <p className="sim-warn">Finer grids can exceed the hosted compute budget ({exec.budget_s} s). If the run is stopped, choose 40 × 20 or a shorter window, or run SOLARIS locally.</p>}
          <div className="sim-actions"><Btn onClick={submit} disabled={run.busy}>{run.busy ? 'Running coupled experiment…' : 'Run coupled experiment'}</Btn></div>
          <RunStatus run={run} budget={inline ? exec.budget_s : null} />
        </Panel>
      </div>
      <div className="sim-stack">
        {run.id && run.frames > 0 && (run.busy || res) && <Panel title="Chamber: computed fields" sub="Sealed chamber, transient 2-D solver output"><L3Viewer run={run} result={res} live={run.busy} /></Panel>}
        {res && run.status === 'completed' ? <>
          <Panel title="Flight and flame on one time base" sub={`Chamber time = flight time − ${fmt(w0, 6)} s`} actions={<SimulatedBadge>Simulation output</SimulatedBadge>}>
            <div className="sim-split">
              <LinePlot title="Chamber-frame acceleration applied (from flight)" xLabel="chamber time [s]" yLabel="a [m/s²]" aspect={0.6} events={(cp.events_in_window ?? []).map(e => ({ t: e.t_chamber }))} series={[{ label: 'axial', x: h.map(r => r.t), y: h.map(r => r.axial), color: '#1679c2' }, { label: 'lateral', x: h.map(r => r.t), y: h.map(r => r.lateral), color: '#6b5bd2' }]} />
              <LinePlot title="Flame: peak temperature" xLabel="chamber time [s]" yLabel="T max [K]" aspect={0.6} events={(cp.events_in_window ?? []).map(e => ({ t: e.t_chamber }))} series={[{ label: 'T max', x: series.map(r => r.t), y: series.map(r => r.T_max), color: '#c2475b' }]} />
              {ftel && <LinePlot title="Flight: altitude around the window" xLabel="mission elapsed time [s]" yLabel="altitude [km]" aspect={0.6} events={[{ t: w0 }, { t: w0 + cp.time_mapping.duration_s }]} series={[{ label: 'altitude', x: inWin(ftel.altitude_m).map(r => r[0]), y: inWin(ftel.altitude_m).map(r => r[1] / 1000), color: '#2bb3a3' }]} />}
              <LinePlot title="Flame: total heat-release rate" xLabel="chamber time [s]" yLabel="HRR [W]" aspect={0.6} series={[{ label: 'HRR', x: series.map(r => r.t), y: series.map(r => r.hrr_total_w), color: '#c8861a' }]} /></div>
            <KV rows={[['Experiment ID', <code>{run.data.manifest.experiment_id ?? '—'}</code>], ['Flight run', <code>{res.flight?.flight_run_id}</code>], ['Coupling', cp.coupling], ['Sign convention', cp.sign_convention], ['Time mapping', `${cp.time_mapping.t_chamber}; ${cp.time_mapping.interpolation}`], ['Largest unresolved acceleration', cp.max_unresolved_acceleration_m_s2, 'm/s²'], ['Note', cp.unresolved_note]]} />
            <Notes title="Flight events inside the window" items={cp.events_in_window?.length ? cp.events_in_window.map(e => `Flight T+ ${fmt(e.t_flight, 6)} s = chamber ${fmt(e.t_chamber, 3)} s — ${e.name}`) : ['None.']} />
          </Panel>
          <Panel title="Flame result" sub={res.model}><L3Summary result={res} /><Notes title="Model assumptions" items={res.assumptions} /></Panel></>
          : !run.busy && <Panel title="Result"><p className="s-muted">{run.status && run.status !== 'completed' ? 'This run produced no reportable result (see status).' : 'Not run yet. The coupled result appears after the solver finishes.'}</p>
            <div className="sim-row"><Tag>Flight → chamber only</Tag><Tag>Sealed boundary</Tag></div></Panel>}
        {run.id && !run.busy && run.status !== 'rejected' && <Passport runId={run.id} key={run.id + run.status} />}
      </div>
    </div>}
  </Page>;
}
