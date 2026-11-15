import React, { Suspense, lazy, useMemo, useState } from 'react';
import { ArrowUpRight, Gauge, Globe2, Info, Orbit, RotateCcw, ShieldAlert, Sigma } from 'lucide-react';
import { ENVIRONMENTS, ASSUMPTIONS, analyse, buoyantVelocityCmS } from '../scientific/flamePhysics.js';
import { useReducedMotion } from '../lib/motion.js';
import { EvidenceBadge, PageHeader, Skeleton } from '../components/ui.jsx';
import FlamePreview from '../features/cosmic-flame/FlamePreview.jsx';
import { webglAvailable } from '../features/cosmic-flame/webgl.js';

// Teammate integration point: if src/features/cosmic-flame-v2/index.jsx exists, it is offered here.
const teammate = import.meta.glob('../features/cosmic-flame-v2/index.jsx');
const TeammateLab = teammate['../features/cosmic-flame-v2/index.jsx'] ? lazy(teammate['../features/cosmic-flame-v2/index.jsx']) : null;
const SolarScene = lazy(() => import('../features/cosmic-flame/SolarScene.jsx'));

const ENV_EVIDENCE = {
  earth: { text: 'Earth-gravity comparisons appear in BASS-II reports (e.g. downward spread vs microgravity data).', href: '#/research?tool=safety' },
  iss: { text: 'BASS, BASS-II, ACME, FLEX, SAME and SPICE ran on the ISS. Explore the real BASS-II records.', href: '#/explore' },
  moon: { text: 'No SOLARIS dataset was recorded in lunar partial gravity — an evidence gap.', href: '#/research?tool=gaps' },
  mars: { text: 'No SOLARIS dataset was recorded in martian partial gravity — an evidence gap.', href: '#/research?tool=gaps' },
};
const fmt = (v) => v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.01 ? v.toFixed(2) : v.toExponential(1);

function Lab() {
  const reduced = useReducedMotion();
  const [envId, setEnvId] = useState('iss');
  const env = ENVIRONMENTS[envId];
  const [o2, setO2] = useState(env.o2Pct);
  const [p, setP] = useState(env.pressureKPa);
  const [flow, setFlow] = useState(5);
  const [orbitSpeed, setOrbitSpeed] = useState(1);
  const [use3d, setUse3d] = useState(() => webglAvailable());
  const result = useMemo(() => analyse({ gEff: env.gEff, flowCmS: flow, o2Pct: o2, pressureKPa: p }), [env.gEff, flow, o2, p]);
  const choose = (id) => { setEnvId(id); setO2(ENVIRONMENTS[id].o2Pct); setP(ENVIRONMENTS[id].pressureKPa); };
  const maxUb = buoyantVelocityCmS(ENVIRONMENTS.earth.gEff);

  return <div className="container cf-layout">
    <section className="cf-space" data-reveal="fade">
      <div className="cf-space-head">
        <span className="s-label" style={{ color: '#9cc7e6' }}><Orbit size={13} /> Choose an environment</span>
        <EvidenceBadge kind="illustration">Not to scale</EvidenceBadge>
      </div>
      {use3d ? <Suspense fallback={<div className="cf-scene cf-loading"><Skeleton lines={1} height={10} style={{ width: 160 }} /><span>Loading 3D scene…</span></div>}>
        <SolarScene selected={envId} onSelect={choose} speed={orbitSpeed} reducedMotion={reduced} />
      </Suspense> : <div className="cf-scene cf-fallback"><Globe2 size={34} /><p>3D view unavailable (WebGL disabled or not supported). Use the environment buttons — everything else works the same.</p></div>}
      <div className="cf-env" role="radiogroup" aria-label="Environment">
        {Object.entries(ENVIRONMENTS).map(([id, e]) => <button key={id} type="button" role="radio" aria-checked={envId === id} className={`cf-env-btn ${envId === id ? 'is-on' : ''}`} onClick={() => choose(id)}>
          <strong>{e.label}</strong><small>g_eff {e.freeFall ? '≈ 10⁻⁶ g' : `${(e.gEff / 9.80665).toFixed(2)} g`}</small></button>)}
      </div>
      <div className="cf-space-foot">
        {use3d && <label className="cf-speed"><span>Orbit animation</span><input type="range" min="0" max="4" step="0.25" value={orbitSpeed} onChange={e => setOrbitSpeed(+e.target.value)} aria-label="Orbit animation speed" /></label>}
        <button type="button" className="s-btn s-btn-sm cf-toggle" onClick={() => setUse3d(v => !v && webglAvailable())}>{use3d ? 'Switch to 2D controls' : 'Try 3D view'}</button>
      </div>
    </section>

    <section className="cf-panel s-panel" data-reveal>
      <div className="s-row" style={{ justifyContent: 'space-between' }}>
        <div><span className="s-label">{env.label}</span><h2 className="s-h3" style={{ fontSize: 22, marginTop: 4 }}>{result.regimeLabel}</h2></div>
        <EvidenceBadge kind="model">Simplified model · uncalibrated</EvidenceBadge>
      </div>
      <p className="s-muted">{env.note}</p>
      <div className="cf-grid">
        <div className="cf-flame-wrap"><FlamePreview shape={result.shape} regime={result.regimeLabel} reducedMotion={reduced} flowCmS={flow} /></div>
        <div className="cf-controls">
          <label className="s-field"><span>Oxygen (% by volume): {o2.toFixed(1)}</span><input className="s-range" type="range" min="10" max="40" step="0.1" value={o2} onChange={e => setO2(+e.target.value)} /></label>
          <label className="s-field"><span>Cabin pressure (kPa): {p.toFixed(0)}</span><input className="s-range" type="range" min="30" max="110" step="1" value={p} onChange={e => setP(+e.target.value)} /></label>
          <label className="s-field"><span>Imposed airflow (cm/s): {flow}</span><input className="s-range" type="range" min="0" max="60" step="1" value={flow} onChange={e => setFlow(+e.target.value)} /></label>
          <button type="button" className="s-btn s-btn-quiet s-btn-sm" onClick={() => choose(envId)}><RotateCcw size={13} /> Reset to environment defaults</button>
        </div>
      </div>
      <div className="cf-metrics">
        <div><span className="s-label"><Gauge size={12} /> Buoyant velocity scale</span><strong>{fmt(result.ub)} cm/s</strong><div className="s-bar-track"><div className="s-bar-fill" style={{ transform: `scaleX(${Math.min(1, result.ub / maxUb)})` }} /></div></div>
        <div><span className="s-label"><Gauge size={12} /> Imposed flow</span><strong>{flow} cm/s</strong><div className="s-bar-track"><div className="s-bar-fill" style={{ transform: `scaleX(${Math.min(1, flow / maxUb)})` }} /></div></div>
        <div><span className="s-label">O₂ partial pressure</span><strong>{result.ppO2.toFixed(1)} kPa</strong><small>sea-level air ≈ 21.2 kPa</small></div>
        <div><span className="s-label">Local gravity vs effective</span><strong>{env.gLocal.toFixed(2)} → {env.freeFall ? '≈0' : env.gEff.toFixed(2)} m/s²</strong><small>{env.freeFall ? 'free fall removes buoyancy' : 'no free fall'}</small></div>
      </div>
      {result.warnings.map((w, i) => <div key={i} className="s-alert" style={{ marginTop: 10 }}><ShieldAlert size={16} /><span>{w}</span></div>)}
      <div className="cf-evidence">
        <Info size={16} /><span>{ENV_EVIDENCE[envId].text}</span><a className="s-btn s-btn-ghost s-btn-sm" href={ENV_EVIDENCE[envId].href}>See the evidence <ArrowUpRight size={13} /></a>
      </div>
      <details className="cf-assume">
        <summary><Sigma size={15} /> Model, assumptions & limits</summary>
        <p><code>u_b ≈ √(g_eff · L · ΔT/T∞)</code> with L = {ASSUMPTIONS.lengthScaleM * 100} cm and ΔT/T∞ = {ASSUMPTIONS.deltaTRatio}. A mechanism “dominates” when its velocity scale is ≥ {ASSUMPTIONS.regimeRatio}× the other; below {ASSUMPTIONS.diffusionFloorCmS} cm/s total, the label is “diffusion-dominated”.</p>
        <ul>
          <li>Orbital microgravity uses an assumed effective acceleration of 10⁻⁶ g (order of magnitude). Real residual acceleration varies.</li>
          <li>Gravity alone does not determine flame behaviour: fuel, geometry, oxygen, pressure, radiation and flow all matter.</li>
          <li>The drawing maps model outputs to shape and brightness for teaching. It is not CFD and not validated against experiments.</li>
          <li>No flame-spread rate, temperature, extinction limit or risk is computed.</li>
        </ul>
      </details>
    </section>
  </div>;
}

export default function CosmicFlameLab() {
  const [mode, setMode] = useState(TeammateLab ? 'teammate' : 'solaris');
  return <div className="s-page cf-page">
    <PageHeader kicker="Discover / Cosmic Flame Laboratory" title={<>Change the world around a flame. <em>See what changes.</em></>}
      lede="Pick Earth, the ISS, the Moon or Mars, then adjust oxygen, pressure and airflow. A labelled order-of-magnitude model tells you which transport mechanism dominates — and links to the real NASA evidence, or to the gap where evidence is missing."
      aside={TeammateLab && <div className="s-tabs" role="tablist"><button type="button" role="tab" className="s-tab" aria-selected={mode === 'solaris'} onClick={() => setMode('solaris')}>SOLARIS lab</button><button type="button" role="tab" className="s-tab" aria-selected={mode === 'teammate'} onClick={() => setMode('teammate')}>Cosmic Flame Lab v2</button></div>} />
    {mode === 'teammate' && TeammateLab ? <Suspense fallback={<div className="container"><Skeleton lines={6} /></div>}><div className="container"><div className="s-alert is-info" style={{ marginBottom: 12 }}><Info size={16} />Team module: educational model, not validated against experiments.</div></div><TeammateLab /></Suspense> : <Lab />}
  </div>;
}
