/** World Builder (from SOLARIS 5.0): gas mixtures, thermodynamic state, effective acceleration and hydrostatic profiles. */
import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Download, Flame, Save } from 'lucide-react';
import { api, download, store } from '../features/sim/api.js';
import { Banner, Btn, Card, Cards, Check, CompositionEditor, ErrorBox, fmt, KV, Level, Notes, Num, Page, Panel, Select, SimulatedBadge, Tag, Text, useAsync, useCapabilities } from '../features/sim/ui.jsx';
import { LinePlot } from '../features/sim/plots.jsx';
import { saveScenario, ScenarioBanner, useScenario } from '../features/sim/scenarios.jsx';
import { Skeleton } from '../components/ui.jsx';

const KIND_TEXT = {
  earth_reference: 'Earth reference atmosphere', mars_reference: 'Mars reference atmosphere', moon_surface: 'Moon surface (vacuum)', custom_world: 'Custom world',
  sealed_chamber: 'Sealed chamber', spacecraft_cabin: 'Spacecraft cabin', interplanetary_vacuum: 'Interplanetary vacuum', accel_lab: 'Constant-acceleration laboratory', rotating_habitat: 'Rotating habitat',
};
const clone = x => JSON.parse(JSON.stringify(x));

export default function World() {
  const caps = useCapabilities(), presets = useAsync(s => api.presets(s), []);
  const [env, setEnv] = useState(() => store.get('environment')), [result, setResult] = useState(null), [profile, setProfile] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [saved, setSaved] = useState('');
  useEffect(() => { if (!env && presets.data) setEnv(clone(presets.data.presets[0])); }, [presets.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const species = caps.data?.species_registry ?? [];
  const set = patch => { setEnv(e => ({ ...e, ...patch })); setResult(null); setProfile(null); setSaved(''); };
  const [scenario, closeScenario] = useScenario('world', q => { if (q.environment) { setEnv(clone(q.environment)); setResult(null); setProfile(null); } });
  const acc = env?.acceleration ?? {};
  const evaluate = async () => {
    setBusy(true); setError(null); setResult(null); setProfile(null);
    try { const r = await api.evaluate(env); setResult(r); if (env.profile?.type === 'layers') setProfile(await api.profile(env, null)); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  const use = () => { store.set('environment', env); store.set('environment_eval', result); setSaved('Selected as the active environment for the Flame Laboratory and the onboard experiment.'); };
  const save = async () => { try { const r = await saveScenario({ title: env.name, destination: 'world', kind: env.kind, summary: `${KIND_TEXT[env.kind]} — ${fmt(env.pressure_pa)} Pa, ${fmt(env.temperature_k)} K`, payload: { environment: env } }); setSaved(`Scenario saved (${r.id}${r.origin === 'browser' ? ', kept in this browser' : ''}).`); } catch (e) { setError(e); } };
  const P = result?.properties, isCustom = env?.kind === 'custom_world', sealedLike = ['sealed_chamber', 'spacecraft_cabin'].includes(env?.kind);
  const gVec = acc.vector_m_s2 ?? [0, 0, 0];

  return <Page kicker="Simulate / World Builder" title={<>Build a world and its <em>atmosphere.</em></>}
    lede="Define the gas mixture, pressure, temperature, acceleration and boundary of an environment. Properties come from ideal-gas mixture thermodynamics (Cantera NASA-7 data); atmospheric profiles are integrated hydrostatically. The result becomes the environment for a combustion study or an onboard experiment."
    aside={<div className="sim-row"><Level level={1} text="Thermodynamic state" /><SimulatedBadge>Computed · not a NASA measurement</SimulatedBadge></div>}>
    <ErrorBox error={presets.error || caps.error} onRetry={() => { presets.retry(); caps.retry(); }} />
    <ScenarioBanner scenario={scenario} onClose={closeScenario} />
    {presets.loading && <Panel><Skeleton lines={3} /></Panel>}
    {presets.data && <Panel title="1 · Start from a reference environment" sub="Reference presets cite their source; every value stays editable.">
      <Cards label="Reference environments">{presets.data.presets.map(p => <Card key={p.name} pressed={env?.name === p.name} onClick={() => { setEnv(clone(p)); setResult(null); setProfile(null); setError(null); setSaved(''); }}>
        <span className="s-chip">{KIND_TEXT[p.kind]}</span><strong>{p.name}</strong><span>{fmt(p.pressure_pa)} Pa · {fmt(p.temperature_k)} K · {p.boundary.type} boundary</span></Card>)}</Cards>
    </Panel>}
    {env && <div className="sim-grid">
      <div className="sim-stack">
        <Panel title="2 · Define the environment">
          <Text label="Name" value={env.name} maxLength={120} onChange={v => set({ name: v })} />
          <div className="sim-row"><Select label="Environment kind" value={env.kind} onChange={k => set({ kind: k })} options={Object.entries(KIND_TEXT)} />
            <Select label="Boundary" value={env.boundary.type} onChange={t => set({ boundary: { ...env.boundary, type: t, volume_m3: t === 'sealed' ? env.boundary.volume_m3 ?? 1 : env.boundary.volume_m3 } })} options={[['open', 'Open (ambient reservoir)'], ['prescribed_flow', 'Prescribed ventilation flow'], ['sealed', 'Sealed (fixed mass & volume)']]} /></div>
          <CompositionEditor value={env.composition} onChange={c => set({ composition: c })} species={species} label="Gas mixture" allowHumidity />
          <div className="sim-row"><Num label="Pressure" unit="Pa" min={0} max={1e8} value={env.pressure_pa} onChange={v => set({ pressure_pa: v })} hint="0 Pa = vacuum (no continuum gas)." />
            <Num label="Temperature" unit="K" min={0.1} max={6000} value={env.temperature_k} onChange={v => set({ temperature_k: v })} />
            <Num label="Altitude" unit="m" value={env.altitude_m} onChange={v => set({ altitude_m: v })} hint="Used with a layered profile." /></div>
          <div className="sim-row">{env.boundary.type === 'sealed' && <Num label="Sealed volume" unit="m³" min={1e-6} max={1e6} value={env.boundary.volume_m3 ?? 1} onChange={v => set({ boundary: { ...env.boundary, volume_m3: v } })} />}
            {env.boundary.type === 'prescribed_flow' && <Num label="Ventilation speed" unit="m/s" min={0} max={50} value={env.boundary.ventilation_m_s} onChange={v => set({ boundary: { ...env.boundary, ventilation_m_s: v } })} />}
            {[0, 1, 2].map(i => <Num key={i} label={`Wind ${'xyz'[i]}`} unit="m/s" min={-300} max={300} value={env.wind_m_s[i]} onChange={v => set({ wind_m_s: env.wind_m_s.map((w, k) => k === i ? v : w) })} />)}</div>
          <h3>Acceleration felt by the gas</h3>
          <div className="sim-row"><Select label="Acceleration model" value={acc.mode} onChange={m => set({ acceleration: { ...acc, mode: m, omega_rad_s: m === 'rotating' ? acc.omega_rad_s ?? 0.2094 : acc.omega_rad_s, radius_m: m === 'rotating' ? acc.radius_m ?? 224 : acc.radius_m } })}
            options={[['body', 'Gravity of the body (μ/r²)'], ['explicit', 'Explicit vector'], ['rotating', 'Rotating habitat (ω²r)'], ['free_fall', 'Free fall (≈ 0 g)']]} hint={sealedLike ? 'Cabin gas state is independent of the vacuum outside.' : undefined} />
            {acc.mode === 'explicit' && [0, 1, 2].map(i => <Num key={i} label={`a${'xyz'[i]}`} unit="m/s²" min={-500} max={500} value={gVec[i]} onChange={v => set({ acceleration: { ...acc, vector_m_s2: gVec.map((w, k) => k === i ? v : w) } })} />)}
            {acc.mode === 'rotating' && <><Num label="Spin rate ω" unit="rad/s" min={0} max={10} value={acc.omega_rad_s ?? 0} onChange={v => set({ acceleration: { ...acc, omega_rad_s: v } })} /><Num label="Radius" unit="m" min={0.1} max={1e5} value={acc.radius_m ?? 1} onChange={v => set({ acceleration: { ...acc, radius_m: v } })} /></>}</div>
          {(env.body || isCustom) && <><h3>Body {env.body?.fictional && <Tag tone="warn">Fictional</Tag>}</h3>
            <div className="sim-row"><Num label="Gravitational parameter μ" unit="m³/s²" min={1} max={1e22} value={env.body?.mu_m3_s2 ?? 3.986e14} onChange={v => set({ body: { name: 'custom', radius_m: 6.371e6, rotation_rate_rad_s: 0, fictional: true, ...env.body, mu_m3_s2: v } })} />
              <Num label="Radius" unit="m" min={1e3} max={1e9} value={env.body?.radius_m ?? 6.371e6} onChange={v => set({ body: { name: 'custom', mu_m3_s2: 3.986e14, rotation_rate_rad_s: 0, fictional: true, ...env.body, radius_m: v } })} /></div>
            {isCustom && <p className="sim-warn">A custom world is a <b>local sandbox</b>: its surface environment and gravity are used for combustion and local studies. It is not inserted into the Solar-System ephemeris; flights around a fictional body are labelled as a fictional dynamical scenario.</p>}</>}
          <div className="sim-actions" style={{ marginTop: 14 }}><Btn onClick={evaluate} disabled={busy}>{busy ? 'Evaluating…' : 'Evaluate environment'}</Btn>
            <Btn kind="ghost" onClick={() => download(`${env.name.replace(/\W+/g, '_')}.environment.json`, JSON.stringify(env, null, 2), 'application/json')}><Download size={14} /> Export definition (JSON)</Btn></div>
          <ErrorBox error={error} />
        </Panel>
      </div>
      <div className="sim-stack">
        {!result && !error && <Panel title="3 · Computed state"><p className="s-muted">Press “Evaluate environment” to compute mixture properties. Nothing is shown until the server has validated the definition.</p></Panel>}
        {result && <Panel title="3 · Computed state" sub={result.equation_of_state} actions={<><Btn small onClick={use}><Flame size={14} /> Use in Flame Laboratory</Btn><Btn kind="ghost" small onClick={save}><Save size={14} /> Save scenario</Btn></>}>
          {saved && <p className="sim-ok" role="status">{saved} {saved.startsWith('Selected') && <a href="#/flame">Open Flame Laboratory <ArrowUpRight size={12} /></a>}</p>}
          {P?.vacuum ? <p className="sim-warn">Vacuum: pressure is zero, so continuum gas properties (density, sound speed, viscosity) are undefined and combustion of an ambient mixture is not supported here. Use a sealed chamber or cabin for onboard experiments.</p> :
            <KV rows={[['Density', P.density_kg_m3, 'kg/m³'], ['Mean molar mass', P.molar_mass_kg_mol * 1000, 'g/mol'], ['Specific gas constant', P.specific_gas_constant_j_kg_k, 'J/(kg·K)'], ['cp', P.cp_j_kg_k, 'J/(kg·K)'], ['γ = cp/cv', P.gamma], ['Speed of sound', P.sound_speed_m_s, 'm/s'],
              ['Dynamic viscosity', P.viscosity_pa_s, 'Pa·s'], ['Thermal conductivity', P.thermal_conductivity_w_m_k, 'W/(m·K)'], ['Thermal diffusivity', P.thermal_diffusivity_m2_s, 'm²/s'], ['Prandtl number', P.prandtl], ['Mean free path', P.mean_free_path_m, 'm'],
              ['O₂ mole fraction', result.oxygen?.mole_fraction], ['O₂ partial pressure', result.oxygen?.partial_pressure_pa, 'Pa'], ['Acceleration magnitude', result.acceleration?.magnitude_m_s2, 'm/s²']]} />}
          <h3>Resolved mixture</h3>
          <div className="s-table-wrap"><table className="s-table"><thead><tr><th>Species</th><th>Mole fraction</th><th>Mass fraction</th><th>Partial pressure [Pa]</th></tr></thead><tbody>
            {Object.entries(result.mixture.mole_fractions).map(([k, v]) => <tr key={k}><td>{k}</td><td>{fmt(v, 6)}</td><td>{fmt(P?.mass_fractions?.[k], 6)}</td><td>{fmt(P?.partial_pressures_pa?.[k], 6)}</td></tr>)}</tbody></table></div>
          <Notes title="Warnings" items={result.warnings?.map(w => typeof w === 'string' ? w : w.message)} tone="warn" />
          <KV rows={[['Acceleration model', result.acceleration?.model], ['Property source', result.property_source]]} />
          <details className="sim-details"><summary>Full computed record (JSON)</summary><pre>{JSON.stringify(result, null, 1)}</pre></details>
        </Panel>}
        {profile && <Panel title="Hydrostatic profile" sub={profile.model}>
          <div className="sim-split"><LinePlot title="Pressure vs altitude" aspect={0.7} xLabel="altitude [km]" yLabel="log10 p [Pa]" logY series={[{ label: 'pressure', x: profile.altitude_m.map(z => z / 1000), y: profile.pressure_pa }]} />
            <LinePlot title="Temperature vs altitude" aspect={0.7} xLabel="altitude [km]" yLabel="T [K]" series={[{ label: 'temperature', x: profile.altitude_m.map(z => z / 1000), y: profile.temperature_k, color: '#2bb3a3' }]} /></div>
          <KV rows={[['Surface gravity', profile.surface_gravity_m_s2, 'm/s²'], ['Pressure scale height (surface)', profile.pressure_scale_height_surface_m, 'm'], ['Source', profile.source], ['Applicability', profile.applicability]]} /></Panel>}
        <Banner>These are <b>computed</b> properties of an ideal-gas model, not measurements. To compare with NASA conditions, open a record in the <a href="#/explore?view=tables">Data Atlas</a> and read its oxygen and pressure fields as written.</Banner>
      </div>
    </div>}
  </Page>;
}
