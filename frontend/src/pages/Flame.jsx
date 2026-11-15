/** Flame Laboratory (from SOLARIS 5.0): Level 1 thermochemistry, Level 2 1-D flames, Level 3 transient 2-D reacting flow. */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Globe2, Pause, Play } from 'lucide-react';
import { api, ledger, store } from '../features/sim/api.js';
import { Banner, Btn, Check, CompositionEditor, ErrorBox, fmt, KV, Level, Notes, Num, Page, Panel, Passport, RunStatus, Select, SimulatedBadge, Tag, useCapabilities, useExecution, useRun } from '../features/sim/ui.jsx';
import { FieldMap, LinePlot } from '../features/sim/plots.jsx';
import { ScenarioBanner, useScenario } from '../features/sim/scenarios.jsx';
import { Tabs } from '../components/ui.jsx';

export const MODES = [
  ['equilibrium', 'Equilibrium', 1, 'Chemical equilibrium state (adiabatic flame temperature). Says nothing about ignition or whether a flame persists.'],
  ['reactor', 'Homogeneous reactor', 1, 'Zero-dimensional ignition study with detailed kinetics. No transport, no flame structure.'],
  ['premixed_flame', '1-D premixed flame', 2, 'Freely propagating laminar premixed flame: burning velocity and structure. Gravity does not enter this model.'],
  ['counterflow_flame', '1-D counterflow flame', 2, 'Opposed-jet diffusion flame along the stagnation streamline. Gravity does not enter this model.'],
  ['flame_l3', '2-D transient jet flame', 3, 'Transient low-Mach laminar reacting flow of a fuel jet in the selected environment, with acceleration (buoyancy) and an open or sealed boundary.'],
];
const AIR = { basis: 'mole', species: { N2: 0.79, O2: 0.21 }, humidity: { mode: 'none' } };
const FIELD_INFO = { T: ['Temperature', 'K'], hrr: ['Heat-release rate', 'W/m³'], u: ['Axial velocity', 'm/s'], v: ['Radial / lateral velocity', 'm/s'], rho: ['Density', 'kg/m³'], p_dyn: ['Dynamic pressure perturbation', 'Pa'], X_CH4: ['CH₄ mole fraction', '–'], X_H2: ['H₂ mole fraction', '–'], X_O2: ['O₂ mole fraction', '–'], X_H2O: ['H₂O mole fraction', '–'], X_CO2: ['CO₂ mole fraction', '–'], X_N2: ['Diluent mole fraction', '–'] };

/** Frame player for stored Level-3 solver output. Frames come from the run store or the browser record; nothing is synthesised client-side. */
export function L3Viewer({ run, result, live = false }) {
  const runId = run.id, count = Math.max(run.frames || result?.n_frames || 0, 0);
  const [idx, setIdx] = useState(0), [field, setField] = useState('T'), [frame, setFrame] = useState(null), [err, setErr] = useState(null), [playing, setPlaying] = useState(false), [localFrames, setLocalFrames] = useState(null), cache = useRef(new Map());
  useEffect(() => { cache.current = new Map(); setIdx(0); setFrame(null); setLocalFrames(null); if (run.local) ledger.frames(runId).then(f => setLocalFrames(f || { items: [] })); }, [runId, run.local]);
  const n = run.local ? (localFrames?.items?.length ?? 0) : count;
  useEffect(() => { if (live && n > 0) setIdx(n - 1); }, [live, n]);
  useEffect(() => {
    if (!runId || !n) return undefined;
    const i = Math.min(idx, n - 1);
    if (run.local) { const f = localFrames.items[i]; setFrame({ ...f, available_fields: localFrames.fields }); return undefined; }
    const key = `${i}:${field}`; if (cache.current.has(key)) { setFrame(cache.current.get(key)); return undefined; }
    const c = new AbortController(); api.frame(runId, i, field, c.signal).then(f => { cache.current.set(key, f); setFrame(f); setErr(null); }).catch(e => e.name !== 'AbortError' && setErr(e)); return () => c.abort();
  }, [runId, idx, field, n, run.local, localFrames]);
  useEffect(() => { if (!playing) return undefined; const t = setInterval(() => setIdx(i => { if (i >= n - 1) { setPlaying(false); return i; } return i + 1; }), 220); return () => clearInterval(t); }, [playing, n]);
  if (run.local && !localFrames) return <p className="s-muted">Loading stored frames…</p>;
  if (!n) return <p className="s-muted">{run.local ? 'Solver frames for this hosted run are not available in this browser any more. Re-run the case to view its fields.' : 'No solver frames stored yet.'}</p>;
  const fields = frame?.available_fields ?? ['T', 'hrr'], info = FIELD_INFO[field] ?? [field, ''];
  const grid = result?.grid ?? { geometry: 'axisymmetric', dx_m: 1, dy_m: 1 };
  return <div>
    <div className="sim-player"><Btn kind="ghost" small onClick={() => { if (idx >= n - 1) setIdx(0); setPlaying(p => !p); }} disabled={live}>{playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play stored frames</>}</Btn>
      <input type="range" min={0} max={n - 1} value={Math.min(idx, n - 1)} onChange={e => { setPlaying(false); setIdx(Number(e.target.value)); }} aria-label="Solver output frame" />
      <span className="s-muted">frame {Math.min(idx, n - 1) + 1}/{n}</span>
      <Select label="Field" value={field} onChange={setField} options={fields.map(f => [f, FIELD_INFO[f]?.[0] ?? f])} /></div>
    <ErrorBox error={err} />
    {frame && <FieldMap frame={frame} field={field} grid={grid} label={info[0]} unit={info[1]} />}
    <p className="s-muted">Colours map the solver's cell values for the selected stored time step (linear scale between the frame minimum and maximum). {live ? 'Showing the latest frame written by the running solver.' : 'Playback steps through stored output; it is not an animation effect.'}{run.local && localFrames?.note ? ` ${localFrames.note}` : ''}</p>
  </div>;
}

export function L3Summary({ result }) {
  const s = result.series ?? [], last = s[s.length - 1] ?? {}, b = result.budgets ?? {}, c = result.classification ?? {}, t = s.map(r => r.t);
  return <>
    <div className="sim-row"><Tag tone={c.state === 'burning' ? 'ok' : 'warn'}>End state: {c.state ?? 'unknown'}</Tag><span className="s-muted">{c.criterion}</span></div>
    {c.caveat && <p className="sim-warn">{c.caveat}</p>}
    <KV rows={[['Simulated time', result.time_reached_s, 's'], ['Steps', result.steps], ['Peak temperature (end)', last.T_max, 'K'], ['Total heat-release rate (end)', last.hrr_total_w, 'W'], ['Fuel chemical power supplied', result.fuel_power_w, 'W'], ['HRR / fuel power', c.hrr_over_fuel_power],
      ['Flame height', last.flame_height_m != null ? last.flame_height_m * 1000 : null, 'mm'], ['Flame width', last.flame_width_m != null ? last.flame_width_m * 1000 : null, 'mm'], ['Flame tilt', last.flame_tilt_deg, '°'], ['Thermodynamic pressure (end)', last.p0_pa, 'Pa'], ['Min O₂ mole fraction', last.o2_min_mole_fraction], ['Max flow speed', last.u_max, 'm/s'],
      ['Mass residual (relative)', b.mass?.residual_relative_to_initial], ['Energy residual (relative)', b.energy?.residual_relative_to_reference], ['Max Mach number', Math.max(...s.map(r => r.mach ?? 0))], ['Grid', `${result.grid.nx} × ${result.grid.ny} (${result.grid.geometry})`]]} />
    <div className="sim-split">
      <LinePlot title="Peak temperature" xLabel="time [s]" yLabel="T max [K]" aspect={0.6} series={[{ label: 'T max', x: t, y: s.map(r => r.T_max) }]} />
      <LinePlot title="Total heat-release rate" xLabel="time [s]" yLabel="HRR [W]" aspect={0.6} series={[{ label: 'HRR', x: t, y: s.map(r => r.hrr_total_w), color: '#c8861a' }]} />
      <LinePlot title="Acceleration applied to the gas" xLabel="time [s]" yLabel="a [m/s²]" aspect={0.6} series={[{ label: 'axial', x: t, y: s.map(r => r.accel_axial), color: '#1679c2' }, { label: 'lateral', x: t, y: s.map(r => r.accel_lateral), color: '#6b5bd2' }]} />
      <LinePlot title="Thermodynamic pressure and oxygen inventory" xLabel="time [s]" yLabel="p0 [kPa] · O₂ [mg]" aspect={0.6} series={[{ label: 'p0 [kPa]', x: t, y: s.map(r => r.p0_pa / 1000), color: '#2bb3a3' }, { label: 'O₂ mass [mg]', x: t, y: s.map(r => r.o2_mass_kg * 1e6), color: '#c2475b' }]} /></div>
    <Notes title="Definitions" items={Object.entries(result.definitions ?? {}).map(([k, v]) => `${k}: ${v}`)} />
  </>;
}

function Results({ kind, r }) {
  if (!r) return null;
  const prof = r.profiles, mf = prof?.mole_fractions;
  return <>
    {kind === 'equilibrium' && <><Banner>Equilibrium is the end state thermodynamics allows. It does <b>not</b> establish that this mixture ignites or that a flame persists.</Banner>
      <KV rows={[['Equilibrium temperature', r.final.temperature_k, 'K'], ['Equilibrium pressure', r.final.pressure_pa, 'Pa'], ['Equivalence ratio', r.equivalence_ratio], ['Initial temperature', r.initial.temperature_k, 'K'], ['Density (final)', r.final.density_kg_m3, 'kg/m³'], ['Max element mass-fraction change', r.checks.max_element_mass_fraction_change]]} />
      <h3>Equilibrium composition (mole fractions)</h3><div className="s-table-wrap"><table className="s-table"><tbody>{Object.entries(r.final.mole_fractions).map(([k, v]) => <tr key={k}><td>{k}</td><td>{fmt(v, 5)}</td></tr>)}</tbody></table></div></>}
    {kind === 'reactor' && <><div className="sim-row"><Tag tone={r.ignition.detected ? 'ok' : 'warn'}>{r.ignition.detected ? 'Ignition detected' : 'No ignition within the simulated time'}</Tag><span className="s-muted">{r.ignition.criterion}</span></div>
      <KV rows={[['Ignition delay', r.ignition.detected ? r.ignition.delay_s : null, 's'], ['Final temperature', r.final.temperature_k, 'K'], ['Final pressure', r.final.pressure_pa, 'Pa'], ['Max dT/dt', r.ignition.max_dTdt_k_s, 'K/s'], ['Integrator steps', r.checks.steps], ['Max element mass-fraction change', r.checks.max_element_mass_fraction_change]]} />
      <div className="sim-split"><LinePlot title="Reactor temperature" xLabel="time [s]" yLabel="T [K]" aspect={0.6} series={[{ label: 'T', x: r.series.time_s, y: r.series.temperature_k }]} />
        <LinePlot title="O₂ mole fraction" xLabel="time [s]" yLabel="X O₂" aspect={0.6} series={[{ label: 'O2', x: r.series.time_s, y: r.series.x_o2, color: '#2bb3a3' }]} /></div></>}
    {kind === 'premixed_flame' && <KV rows={[['Laminar burning velocity', r.laminar_burning_velocity_m_s * 100, 'cm/s'], ['Burned-gas temperature', r.burned_temperature_k, 'K'], ['Thermal thickness', r.thermal_thickness_m * 1000, 'mm'], ['Peak heat release', r.peak_heat_release_w_m3, 'W/m³'], ['Grid points', r.checks.grid_points], ['Mass-flux variation', r.checks.mass_flux_relative_variation]]} />}
    {kind === 'counterflow_flame' && <><div className="sim-row"><Tag tone={r.solution_branch === 'reacting' ? 'ok' : 'warn'}>Solution branch: {r.solution_branch}</Tag>{r.note && <span className="s-muted">{r.note}</span>}</div>
      <KV rows={[['Peak temperature', r.peak_temperature_k, 'K'], ['Peak position', r.peak_position_m == null ? null : r.peak_position_m * 1000, 'mm'], ['Integrated heat release', r.integrated_heat_release_w_m2, 'W/m²'], ['Mean strain rate', r.strain_rate_mean_1_s, '1/s'], ['Grid points', r.checks.grid_points]]} /></>}
    {prof && <div className="sim-split">
      <LinePlot title="Temperature profile" xLabel="position [mm]" yLabel="T [K]" aspect={0.6} series={[{ label: 'T', x: prof.z_m.map(z => z * 1000), y: prof.temperature_k }]} />
      <LinePlot title="Heat-release rate" xLabel="position [mm]" yLabel="q [W/m³]" aspect={0.6} series={[{ label: 'HRR', x: prof.z_m.map(z => z * 1000), y: prof.heat_release_w_m3, color: '#c8861a' }]} />
      <LinePlot title="Major species (mole fraction)" xLabel="position [mm]" yLabel="X" aspect={0.6} series={Object.entries(mf).filter(([, v]) => Math.max(...v) > 1e-4).map(([k, v]) => ({ label: k, x: prof.z_m.map(z => z * 1000), y: v }))} /></div>}
    {kind === 'flame_l3' && <L3Summary result={r} />}
  </>;
}

export default function Flame() {
  const caps = useCapabilities(), exec = useExecution();
  const envSel = store.get('environment'), envEval = store.get('environment_eval');
  const [mode, setMode] = useState(() => store.get('flame_mode', 'equilibrium')), [fuel, setFuel] = useState('CH4');
  const [ox, setOx] = useState(() => envSel?.composition ?? AIR), [p, setP] = useState(envSel?.pressure_pa > 0 ? envSel.pressure_pa : 101325), [T, setT] = useState(envSel && envSel.temperature_k >= 200 ? envSel.temperature_k : 300);
  const [phi, setPhi] = useState(1), [constraint, setConstraint] = useState('HP'), [rT, setRT] = useState(1300), [rDur, setRDur] = useState(0.5), [rCon, setRCon] = useState('constant_pressure');
  const [width, setWidth] = useState(0.02), [mf, setMf] = useState(0.24), [mo, setMo] = useState(0.72);
  const g0 = envEval?.acceleration?.vector_m_s2?.[2] ?? -9.80665;
  const [l3, setL3] = useState({ geometry: 'axisymmetric', boundary: envSel?.boundary?.type === 'sealed' ? 'sealed' : 'open', length_m: 0.08, width_m: 0.04, radius_m: 0.003, velocity: 0.25, coflow: 0, accel: Number.isFinite(g0) ? g0 : 0, lateral: 0, nx: 80, ny: 40, duration: 0.4, ignite: true, react: true, radiation: false });
  const run = useRun(store.get('flame_run_' + mode));
  useEffect(() => { store.set('flame_mode', mode); const id = store.get('flame_run_' + mode); if (id) run.load(id); else run.reset(); }, [mode]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (run.id) store.set('flame_run_' + mode, run.id); }, [run.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const species = caps.data?.species_registry ?? [], mech = fuel === 'H2' && !('CO2' in ox.species) && !('He' in ox.species) ? 'h2o2' : 'gri30+He', level = MODES.find(m => m[0] === mode);
  const setL = patch => setL3(s => ({ ...s, ...patch }));
  const applyScenario = q => { if (q.environment) { store.set('environment', q.environment); store.set('environment_eval', null); } if (q.mode) setMode(q.mode); if (q.fuel) setFuel(q.fuel); if (q.ox) setOx(q.ox); if (q.p) setP(q.p); if (q.T) setT(q.T); if (q.phi) setPhi(q.phi); if (q.constraint) setConstraint(q.constraint); if (q.l3) setL(q.l3); };
  const [scenario, closeScenario] = useScenario('flame', applyScenario);
  const cells = l3.nx * l3.ny, heavy = cells * l3.duration > 4000, inline = exec?.mode === 'inline';
  const hostedRisk = inline && mode === 'flame_l3' && cells * l3.duration > 1600;

  const submit = () => {
    const fuelC = { basis: 'mole', species: { [fuel]: 1 } }, base = { mechanism: mech, fuel: fuelC, oxidizer: ox };
    const spec = mode === 'equilibrium' ? { ...base, mixing: { mode: 'equivalence_ratio', value: phi }, temperature_k: T, pressure_pa: p, constraint }
      : mode === 'reactor' ? { ...base, mixing: { mode: 'equivalence_ratio', value: phi }, temperature_k: rT, pressure_pa: p, constraint: rCon, duration_s: rDur }
      : mode === 'premixed_flame' ? { ...base, mixing: { mode: 'equivalence_ratio', value: phi }, temperature_k: T, pressure_pa: p, width_m: 0.03 }
      : mode === 'counterflow_flame' ? { ...base, fuel_temperature_k: T, oxidizer_temperature_k: T, pressure_pa: p, fuel_mass_flux_kg_m2_s: mf, oxidizer_mass_flux_kg_m2_s: mo, width_m: width }
      : { geometry: l3.geometry, length_m: l3.length_m, width_m: l3.width_m, boundary: l3.boundary, burner: { radius_m: l3.radius_m, fuel: fuelC, fuel_temperature_k: 300, fuel_velocity_m_s: l3.velocity }, coflow: { velocity_m_s: l3.boundary === 'sealed' ? 0 : l3.coflow },
          ambient: { composition: ox, pressure_pa: p, temperature_k: T }, acceleration_axial_m_s2: l3.accel, acceleration_lateral_m_s2: l3.geometry === 'planar' ? l3.lateral : 0, ignition: { enabled: l3.ignite }, reaction_enabled: l3.react,
          radiation: l3.radiation ? { model: 'gray_optically_thin', planck_mean_absorption_1_m: 0.5 } : { model: 'none' }, numerics: { nx: l3.nx, ny: l3.ny, duration_s: l3.duration, output_interval_s: Math.max(0.005, l3.duration / 40) } };
    run.start({ kind: mode, spec, label: `${level[1]} — ${fuel} in ${envSel?.name ?? 'dry air'}`, environment: envSel ?? null });
  };

  return <Page kicker="Simulate / Flame Laboratory" title={<>Compute what the <em>chemistry and flow support.</em></>}
    lede="Run real thermochemistry (Cantera), one-dimensional reference flames, and a transient two-dimensional laminar reacting-flow solver. Each mode states its fidelity level and what it can and cannot tell you. Nothing here is drawn by hand or randomised."
    aside={<div className="sim-row"><Level level={level[2]} text={level[1]} /><SimulatedBadge /></div>}>
    <ScenarioBanner scenario={scenario} onVariant={applyScenario} onClose={closeScenario} />
    <div className="sim-tabs-row">
      <Tabs label="Combustion model" value={mode} onChange={id => !run.busy && setMode(id)} tabs={MODES.map(([id, name, lv]) => ({ value: id, label: name, icon: <span className="sim-tab-level">L{lv}</span> }))} />
      <a className="s-btn s-btn-quiet s-btn-sm" href="#/lab">Level 0 illustration: Cosmic Flame Lab <ArrowUpRight size={13} /></a>
    </div>
    <Banner>{level[3]}</Banner>
    <ErrorBox error={caps.error} onRetry={caps.retry} />
    <div className="sim-grid">
      <Panel title="Case definition" sub={envSel ? `Environment: ${envSel.name}` : 'No World Builder environment selected — using dry air at 1 atm.'} actions={<a className="s-btn s-btn-ghost s-btn-sm" href="#/world"><Globe2 size={14} /> {envSel ? 'Change environment' : 'Open World Builder'}</a>}>
        <div className="sim-row"><Select label="Fuel" value={fuel} onChange={setFuel} options={[['CH4', 'Methane (CH₄)'], ['H2', 'Hydrogen (H₂)']]} />
          <label className="s-field sim-field"><span>{mode === 'flame_l3' ? 'Chemistry' : 'Mechanism'}</span><input className="s-input" readOnly value={mode === 'flame_l3' ? 'one-step global (Westbrook–Dryer / Marinov)' : caps.data?.mechanisms?.[mech]?.label ?? mech} /></label></div>
        <CompositionEditor value={ox} onChange={setOx} species={species.filter(s => !['CH4', 'H2', 'CO'].includes(s.id))} label={mode === 'flame_l3' ? 'Ambient / oxidizer atmosphere' : 'Oxidizer stream'} />
        <div className="sim-row"><Num label="Pressure" unit="Pa" min={1000} max={5e6} value={p} onChange={setP} />
          {mode !== 'reactor' && <Num label={mode === 'counterflow_flame' ? 'Stream temperature' : mode === 'flame_l3' ? 'Ambient temperature' : 'Unburned temperature'} unit="K" min={200} max={1500} value={T} onChange={setT} />}
          {mode !== 'counterflow_flame' && mode !== 'flame_l3' && <Num label="Equivalence ratio φ" min={0.05} max={10} value={phi} onChange={setPhi} hint="Fuel/oxidizer ratio relative to stoichiometric." />}</div>
        {mode === 'equilibrium' && <Select label="Constraint" value={constraint} onChange={setConstraint} options={[['HP', 'Constant enthalpy & pressure (adiabatic, open)'], ['UV', 'Constant internal energy & volume (adiabatic, sealed)'], ['TP', 'Fixed temperature & pressure']]} />}
        {mode === 'reactor' && <div className="sim-row"><Num label="Initial temperature" unit="K" min={500} max={3000} value={rT} onChange={setRT} hint="Auto-ignition needs a hot start; 300 K will not ignite." /><Num label="Duration" unit="s" min={1e-5} max={100} value={rDur} onChange={setRDur} />
          <Select label="Reactor" value={rCon} onChange={setRCon} options={[['constant_pressure', 'Constant pressure'], ['constant_volume', 'Constant volume (sealed)']]} /></div>}
        {mode === 'counterflow_flame' && <div className="sim-row"><Num label="Fuel mass flux" unit="kg/(m²·s)" min={0.01} max={5} value={mf} onChange={setMf} /><Num label="Oxidizer mass flux" unit="kg/(m²·s)" min={0.01} max={10} value={mo} onChange={setMo} /><Num label="Nozzle separation" unit="m" min={0.005} max={0.1} value={width} onChange={setWidth} /></div>}
        {mode === 'flame_l3' && <>
          <h3>Geometry and boundary</h3>
          <div className="sim-row"><Select label="Geometry" value={l3.geometry} onChange={v => setL({ geometry: v })} options={[['axisymmetric', 'Axisymmetric (round jet)'], ['planar', 'Planar (slot jet)']]} />
            <Select label="Boundary" value={l3.boundary} onChange={v => setL({ boundary: v })} options={[['open', 'Open (constant pressure)'], ['sealed', 'Sealed chamber (pressure rises, O₂ depletes)']]} /></div>
          <div className="sim-row"><Num label="Domain length (axial)" unit="m" min={0.01} max={0.5} value={l3.length_m} onChange={v => setL({ length_m: v })} /><Num label={l3.geometry === 'axisymmetric' ? 'Domain radius' : 'Domain width'} unit="m" min={0.005} max={0.3} value={l3.width_m} onChange={v => setL({ width_m: v })} />
            <Num label={l3.geometry === 'axisymmetric' ? 'Burner radius' : 'Slot half-width'} unit="m" min={0.0005} max={0.05} value={l3.radius_m} onChange={v => setL({ radius_m: v })} /></div>
          <div className="sim-row"><Num label="Fuel jet velocity" unit="m/s" min={0.005} max={5} value={l3.velocity} onChange={v => setL({ velocity: v })} />{l3.boundary === 'open' && <Num label="Co-flow velocity" unit="m/s" min={0} max={2} value={l3.coflow} onChange={v => setL({ coflow: v })} />}</div>
          <h3>Acceleration (drives buoyancy)</h3>
          <div className="sim-row"><Num label="Along burner axis" unit="m/s²" min={-100} max={100} value={l3.accel} onChange={v => setL({ accel: v })} hint="−9.80665 = Earth gravity with the burner pointing up; 0 = free fall." />
            {l3.geometry === 'planar' && <Num label="Lateral" unit="m/s²" min={-100} max={100} value={l3.lateral} onChange={v => setL({ lateral: v })} />}</div>
          <div className="sim-actions"><Btn kind="ghost" small onClick={() => setL({ accel: -9.80665 })}>1 g</Btn><Btn kind="ghost" small onClick={() => setL({ accel: -3.72 })}>Mars</Btn><Btn kind="ghost" small onClick={() => setL({ accel: -1.62 })}>Moon</Btn><Btn kind="ghost" small onClick={() => setL({ accel: 0 })}>0 g</Btn></div>
          <h3>Numerics</h3>
          <div className="sim-row"><Num label="Axial cells" min={24} max={320} step={1} value={l3.nx} onChange={v => setL({ nx: Math.round(v) })} /><Num label="Radial cells" min={12} max={160} step={1} value={l3.ny} onChange={v => setL({ ny: Math.round(v) })} /><Num label="Simulated duration" unit="s" min={0.01} max={20} value={l3.duration} onChange={v => setL({ duration: v })} /></div>
          <Check label="Ignition kernel" checked={l3.ignite} onChange={v => setL({ ignite: v })} hint="A hot spot above the burner at t = 0. Without it the cold jet only mixes." />
          <Check label="Chemical reaction enabled" checked={l3.react} onChange={v => setL({ react: v })} hint="Disable for a non-reacting mixing reference." />
          <Check label="Optically thin gray radiation loss" checked={l3.radiation} onChange={v => setL({ radiation: v })} hint="Simplified loss term; no soot, no re-absorption." />
          {heavy && !inline && <p className="sim-warn">This case has {cells.toLocaleString()} cells × {l3.duration} s and may take several minutes. It runs as a background job with progress; you can cancel it.</p>}
          {hostedRisk && <p className="sim-warn">This case has {cells.toLocaleString()} cells × {l3.duration} s. The hosted service stops runs after {exec.budget_s} s of compute; if it does, use a coarser grid (e.g. 48 × 24) or a shorter duration, or run SOLARIS locally.</p>}
        </>}
        <div className="sim-actions" style={{ marginTop: 14 }}><Btn onClick={submit} disabled={run.busy}>{run.busy ? 'Running…' : `Run ${level[1].toLowerCase()}`}</Btn></div>
        <RunStatus run={run} budget={inline ? exec.budget_s : null} />
      </Panel>
      <div className="sim-stack">
        {mode === 'flame_l3' && run.id && (run.busy || run.data?.result) && run.frames > 0 && <Panel title="Computed fields" sub="Stored solver output"><L3Viewer run={run} result={run.data?.result} live={run.busy} /></Panel>}
        {run.data?.result && run.status === 'completed' ? <Panel title="Results" sub={run.data.result.model} actions={<SimulatedBadge>Simulation output</SimulatedBadge>}><Results kind={run.data.manifest.kind} r={run.data.result} /><Notes title="Model assumptions" items={run.data.result.assumptions} /></Panel>
          : !run.busy && <Panel title="Results"><p className="s-muted">{run.status && run.status !== 'completed' ? 'This run produced no reportable result (see status).' : 'No run yet. Define the case and press Run. Results appear only after the solver finishes.'}</p></Panel>}
        {run.id && !run.busy && run.status !== 'rejected' && <Passport runId={run.id} key={run.id + run.status} />}
      </div>
    </div>
  </Page>;
}
