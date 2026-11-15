/**
 * Cosmic Flame Lab v2 — the teammate's whole-Solar-System laboratory (delivered with SOLARIS 4.0/5.0),
 * loaded automatically by pages/CosmicFlameLab.jsx through its documented integration point.
 * Rebuilt on the live SOLARIS layout and tokens; the physics (scientific/cosmicPhysics.js), the WebGL
 * scene, its 2-D fallback and the flame illustration are the teammate's originals.
 * Level 0 (educational illustration). No ignition probability, flame speed or extinction limit is computed.
 */
import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Compass, FlaskConical, Info, Orbit, RotateCcw, ShieldAlert, Wind } from 'lucide-react';
import { EvidenceBadge } from '../../components/ui.jsx';
import { BODIES, BODY_LOOKUP, EARTH_MOON, evaluateFlame, getEnvironment, solarGravityAtAU } from '../../scientific/cosmicPhysics.js';
import SolarSystemScene from './SolarSystemScene.jsx';
import FlamePreview from './FlamePreview.jsx';
import './cosmic-v2.css';

const float = (x, d = 2) => Number.isFinite(x) ? Number(x).toFixed(d) : '—';
const candidates = [BODIES[3], EARTH_MOON, BODIES[4], BODIES[1], BODIES[2], BODIES[5]];
const SOURCES = [
  { title: 'NASA PSI-25 BASS-II experiment archive', href: 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-25' },
  { title: 'NASA — Studying combustion and fire safety', href: 'https://www.nasa.gov/missions/station/studying-combustion-and-fire-safety/' },
  { title: 'NASA NSSDCA — Mars fact sheet', href: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
];

function Slider({ id, label, value, min, max, step, unit, onChange, disabled = false }) {
  return <label className="s-field" htmlFor={id} style={disabled ? { opacity: .55 } : undefined}><span>{label}: {Number(value).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)} {unit}</span>
    <input className="s-range" id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} /></label>;
}

export default function CosmicFlameLabV2() {
  const [selected, setSelected] = useState({ type: 'body', id: 'earth' });
  const [mode, setMode] = useState('ambient');
  const [gravityMode, setGravityMode] = useState('surface');
  const [spacecraftAccel, setSpacecraftAccel] = useState(1.5);
  const [chamberPressure, setChamberPressure] = useState(101.3);
  const [chamberOxygen, setChamberOxygen] = useState(20.95);
  const [airflow, setAirflow] = useState(0.04);
  const [fuel, setFuel] = useState('wick');
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const body = selected.type === 'body' ? BODY_LOOKUP[selected.id] : null;
  const locationAU = selected.type === 'space' ? selected.au : body?.au || 0.05;
  const locationText = selected.type === 'space' ? `Point in space · ${float(selected.au, 2)} AU` : body?.name || 'Selected location';
  const surfaceAvailable = !!body?.surface;
  const env = useMemo(() => getEnvironment(body?.id, mode, gravityMode, spacecraftAccel, locationAU), [body?.id, mode, gravityMode, spacecraftAccel, locationAU]);
  const conditions = { pressureKPa: mode === 'sealed' ? chamberPressure : env.pressureKPa, oxygenPercent: mode === 'sealed' ? chamberOxygen : env.oxygenPercent, effectiveGravity: env.effectiveGravity, airflow, fuel };
  const predicted = useMemo(() => env.ambientKnown ? evaluateFlame(conditions) : null,   // eslint-disable-next-line react-hooks/exhaustive-deps
    [conditions.pressureKPa, conditions.oxygenPercent, conditions.effectiveGravity, conditions.airflow, conditions.fuel, env.ambientKnown]);
  const field = body?.surface ? body.gravity : solarGravityAtAU(locationAU);
  const selectTarget = next => {
    setSelected(next);
    const nb = next.type === 'body' ? BODY_LOOKUP[next.id] : null;
    setGravityMode(nb?.surface ? 'surface' : 'freefall');
    setMode(nb?.surface ? 'ambient' : next.type === 'space' ? 'ambient' : 'sealed');
  };
  const reset = () => { setSelected({ type: 'body', id: 'earth' }); setMode('ambient'); setGravityMode('surface'); setAirflow(0.04); setFuel('wick'); setChamberPressure(101.3); setChamberOxygen(20.95); setSpacecraftAccel(1.5); setSpeed(1); setPaused(false); setResetToken(v => v + 1); };

  return <div className="container cf-layout cf2-layout">
    <section className="cf-space" data-reveal="fade" aria-label="Interactive Solar System">
      <div className="cf-space-head"><span className="s-label" style={{ color: '#9cc7e6' }}><Orbit size={13} /> Whole Solar System · click a body or a point</span><EvidenceBadge kind="illustration">Orbits schematic · not to scale</EvidenceBadge></div>
      <div className="cf2-scene"><SolarSystemScene key={resetToken} selected={selected} onSelect={selectTarget} speed={speed} paused={paused} resetToken={resetToken} onModeChange={() => {}} /></div>
      <div className="cf-env" role="group" aria-label="Jump to a body">{candidates.map(b => <button key={b.id} type="button" className={`cf-env-btn ${body?.id === b.id ? 'is-on' : ''}`} aria-pressed={body?.id === b.id} onClick={() => selectTarget({ type: 'body', id: b.id })}>
        <strong>{b.name}</strong><small>{b.surface ? `${b.gravity} m/s² surface` : 'no solid surface'}</small></button>)}</div>
      <div className="cf-space-foot">
        <div className="cf2-time" role="group" aria-label="Orbit time"><span className="s-label" style={{ color: '#9cc7e6' }}>Orbit time</span>{[1, 10, 100, 1000].map(n => <button key={n} type="button" className={`cf-env-btn ${speed === n ? 'is-on' : ''}`} aria-pressed={speed === n} onClick={() => setSpeed(n)}>{n}×</button>)}
          <button type="button" className="cf-env-btn" aria-pressed={paused} onClick={() => setPaused(v => !v)}>{paused ? 'Resume' : 'Pause'}</button></div>
        <small style={{ color: '#8fb0c8' }}>1× = 1 simulated day per second</small>
      </div>
    </section>

    <section className="cf-panel s-panel cf2-panel" data-reveal>
      <div className="s-row" style={{ justifyContent: 'space-between' }}>
        <div><span className="s-label"><Compass size={12} /> {body?.kind || 'Interplanetary space'}{body?.au ? ` · ${float(body.au, 3)} AU from the Sun` : ''}</span><h2 className="s-h3" style={{ fontSize: 22, marginTop: 4 }}>{locationText}</h2></div>
        <div className="s-row"><EvidenceBadge kind="illustration">Level 0 · educational illustration</EvidenceBadge><button type="button" className="s-btn s-btn-quiet s-btn-sm" onClick={reset}><RotateCcw size={13} /> Reset</button></div>
      </div>
      <div className="cf-metrics cf2-metrics">
        <div><span className="s-label">Local gravitational field</span><strong>{body?.surface ? `${float(field, 3)} m/s²` : `${float(solarGravityAtAU(locationAU), 4)} m/s²`}</strong><small>{body?.surface ? 'at the surface' : 'solar field at this distance'}</small></div>
        <div><span className="s-label">Effective lab acceleration</span><strong>{float(env.effectiveGravity, 3)} m/s²</strong><small>{env.effectiveMode}</small></div>
        <div><span className="s-label">O₂ partial pressure</span><strong>{predicted ? `${float(predicted.oxygenPartialKPa, 2)} kPa` : '—'}</strong><small>sea-level air ≈ 21.2 kPa</small></div>
        <div><span className="s-label">Model index (uncalibrated)</span><strong>{predicted ? predicted.score : '—'}<small> / 100</small></strong><small>not a probability</small></div>
      </div>
      <p className="s-muted"><Info size={13} style={{ verticalAlign: -2 }} /> {env.effectiveMode === 'freefall' ? 'Free fall is not zero gravity: the laboratory and its surroundings accelerate together, which removes buoyancy inside the chamber.' : env.effectiveMode === 'accelerating' ? 'Effective acceleration here is an imposed spacecraft thrust scenario, not a local-gravity value.' : 'A surface laboratory feels roughly the local surface gravity.'}</p>
      <div className="cf-grid">
        <div className="cf2-flame"><FlamePreview result={predicted} fuel={fuel} location={locationText} mode={mode} onUseChamber={() => setMode('sealed')} /></div>
        <div className="cf-controls">
          <label className="s-field"><span>Oxygen environment</span><select className="s-select" value={mode} onChange={e => setMode(e.target.value)}><option value="ambient">Outside / local conditions</option><option value="sealed">Sealed oxygenated chamber</option></select></label>
          <label className="s-field"><span>Effective acceleration</span><select className="s-select" value={env.effectiveMode} onChange={e => setGravityMode(e.target.value)}><option value="freefall">Free fall · ≈ 0 g effective</option><option value="surface" disabled={!surfaceAvailable}>On the surface</option><option value="accelerating">Accelerating spacecraft</option></select></label>
          <Slider id="cf2-o2" label="Oxygen (%)" value={conditions.oxygenPercent} min={0} max={40} step={0.05} unit="" disabled={mode === 'ambient'} onChange={setChamberOxygen} />
          <Slider id="cf2-p" label="Pressure" value={conditions.pressureKPa} min={0} max={Math.max(200, conditions.pressureKPa)} step={0.1} unit="kPa" disabled={mode === 'ambient'} onChange={setChamberPressure} />
          <Slider id="cf2-flow" label="Imposed airflow" value={airflow} min={0} max={2} step={0.01} unit="m/s" onChange={setAirflow} />
          {env.effectiveMode === 'accelerating' && <Slider id="cf2-acc" label="Spacecraft acceleration" value={spacecraftAccel} min={0} max={15} step={0.1} unit="m/s²" onChange={setSpacecraftAccel} />}
          <label className="s-field"><span>Illustrative fuel configuration</span><select className="s-select" value={fuel} onChange={e => setFuel(e.target.value)}><option value="wick">Wick-like flame (generic)</option><option value="gas">Gas burner (illustrative)</option></select></label>
          {mode === 'ambient' && <p className="s-muted">Ambient values are approximate reference values for the selected body; choose a sealed chamber to edit oxygen and pressure.</p>}
        </div>
      </div>
      {predicted ? <div className="cf2-regime"><strong>{predicted.regime}</strong><span>Normalised from O₂ partial pressure, total pressure and imposed flow. It is not a probability of ignition, a forecast or a NASA-validated prediction; model accuracy is not established.</span></div>
        : <div className="s-alert" style={{ marginTop: 12 }}><Info size={16} /><span><strong>Unknown external conditions.</strong> This location has no defined surface or sampling altitude, so SOLARIS will not guess an ambient oxygen or pressure. Choose a sealed chamber for a meaningful thought experiment.</span></div>}
      {(predicted?.messages ?? []).map((m, i) => <div key={i} className="s-alert" style={{ marginTop: 10 }}><Wind size={16} /><span>{m}</span></div>)}
      <div className="cf-evidence"><FlaskConical size={16} /><span>For computed chemistry and flow in the same conditions, use the Flame Laboratory (Levels 1–3).</span><a className="s-btn s-btn-ghost s-btn-sm" href="#/flame">Open Flame Laboratory <ArrowUpRight size={13} /></a></div>
      <details className="cf-assume">
        <summary><ShieldAlert size={15} /> Model, assumptions & sources</summary>
        <ul>
          <li>Orbital paths and body sizes are schematic; orbital periods are approximate circular paths. Planetary gravity, pressure and oxygen use approximate reference values.</li>
          <li>The model index combines bounded O₂-partial-pressure, pressure and flow terms. It is a tunable illustration, not fitted to BASS-II or any NASA data.</li>
          <li>A flame needs fuel and oxidizer: ambient vacuum cannot sustain a conventional open flame, whatever the local gravitational field.</li>
          <li>No flame temperature, spread rate, extinction limit or risk is computed.</li>
        </ul>
        <p>{SOURCES.map(s => <a key={s.href} className="s-btn s-btn-quiet s-btn-sm" href={s.href} target="_blank" rel="noopener noreferrer">{s.title} <ArrowUpRight size={12} /></a>)}</p>
      </details>
    </section>
  </div>;
}
