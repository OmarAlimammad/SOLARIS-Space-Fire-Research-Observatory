/** One entry point for every Flight Laboratory scenario. Pure (no DOM, no three.js): used by the Web Worker, the main-thread fallback and the Node tests. */
import { BODIES, DAY, norm, sub, cross, tdbFromUtc, FlightError } from './core.js';
import { runMission } from './engine.js';
import { leoCoast, planLunarTransfer, planEarthMars, summarize } from './missions.js';
import { VEHICLES, SATURN_LEGACY_INFO, cloneVehicle } from './vehicles.js';
import { runSaturnLegacy } from './legacyAdapter.js';
import { runSixDof } from './sixdof.js';

export const SCENARIOS = [
  { id: 'saturn_legacy', name: 'Saturn V ascent to parking orbit', vehicle: 'saturn_v', dof: '3-DOF point mass', needsEphemeris: false,
    summary: 'The original Saturn V Flight Lab 2.0 model, unchanged: three-stage ascent from the pad to a low Earth parking orbit. Legacy baseline for regression.',
    limits: 'Educational reconstruction, not historical telemetry. Earth ascent only; this model has no lunar or interplanetary capability.' },
  { id: 'leo', name: 'Low Earth orbit laboratory', vehicle: 'orbital_lab', dof: '3-DOF point mass', needsEphemeris: true,
    summary: 'Hypothetical orbital laboratory coasting in LEO with drag, J2 and Sun/Moon perturbations; optional finite orbit-raise burn.', limits: 'Hypothetical vehicle. No attitude dynamics.' },
  { id: 'lunar', name: 'Earth–Moon transfer and lunar orbit insertion', vehicle: 'apollo_tli_stack', dof: '3-DOF point mass', needsEphemeris: true,
    summary: 'Finite translunar-injection burn from a parking orbit, N-body coast with JPL DE441 Moon states, finite lunar-orbit-insertion burn.',
    limits: 'Bounded demonstration planner (one-parameter search), not a mission-design tool. Launch and landing are not part of this scenario.' },
  { id: 'mars', name: 'Earth–Mars transfer (bounded example)', vehicle: 'mars_probe', dof: '3-DOF point mass', needsEphemeris: true,
    summary: 'Hypothetical probe: Lambert-targeted injection, heliocentric N-body cruise with two trim burns, arrival at the Mars 125 km interface.',
    limits: 'Hypothetical vehicle. Ends at the atmospheric interface: capture, entry, descent and landing are NOT modelled.' },
  { id: 'free', name: 'Custom free-flight state at a chosen body', vehicle: 'orbital_lab', dof: '3-DOF point mass', needsEphemeris: true,
    summary: 'Start in an orbit defined relative to Earth, the Moon or Mars, propagate with N-body gravity, optionally apply a finite prograde burn.',
    limits: 'Hypothetical vehicle placed directly in orbit; how it got there is not simulated. Mars drag uses a simple exponential density model.' },
  { id: 'sixdof', name: '6-DOF rigid-body demonstrator', vehicle: 'sixdof_demo', dof: '6-DOF rigid body', needsEphemeris: false,
    summary: 'Hypothetical spacecraft with quaternion attitude and Euler rotational dynamics: torque-free tumble, a torque pulse, then an off-axis thruster burn.',
    limits: 'Hypothetical vehicle, two-body gravity, constant inertia; no aerodynamic or gravity-gradient torques.' },
];
export const DEFAULTS = {
  saturn_legacy: { payloadFactor: 1, throttle: 1, pitchFinal: 80, windEast: 0 },
  leo: { epoch_utc: '2026-11-20T00:00:00Z', altitude_km: 400, inclination_deg: 51.6, orbits: 2, burn_dv_m_s: 30, drag: true, j2: true },
  lunar: { epoch_utc: '2026-11-20T00:00:00Z', parking_alt_km: 185, perilune_alt_km: 110, tli_dv_m_s: 3150, insert: true },
  free: { epoch_utc: '2027-03-01T00:00:00Z', body: 'mars', periapsis_alt_km: 300, apoapsis_alt_km: 2000, inclination_deg: 30, orbits: 2, burn_dv_m_s: 50 },
  mars: { epoch_utc: '2026-11-14T00:00:00Z', tof_days: 250 },
  sixdof: { mass_kg: 5000, ix: 4000, iy: 9000, iz: 9000, duration_s: 600, wx: 0.05, wy: 0.004, wz: 0.002, torque_n_m: 20, thrust_n: 800, offset_m: 0.25 },
};
const flat = a => { const o = new Float32Array(a.length * 3); a.forEach((p, i) => { o[3 * i] = p[0]; o[3 * i + 1] = p[1]; o[3 * i + 2] = p[2]; }); return o; };
const thin = (n, max) => { const k = Math.max(1, Math.ceil(n / max)), idx = []; for (let i = 0; i < n; i += k) idx.push(i); if (idx.at(-1) !== n - 1) idx.push(n - 1); return idx; };

/** Display frames: vehicle track and body paths relative to one body, non-rotating ICRF axes (pure translation of the propagated states; no smoothing). */
function views(result, eph, ids) {
  const t0 = result.epoch_tdb_s ?? 0, S = result.samples;
  return ids.map(id => {
    const track = S.map(s => s.centre === id || !eph ? s.r : (() => { const o = eph.rel(s.centre, id, t0 + s.t); return [s.r[0] + o[0], s.r[1] + o[1], s.r[2] + o[2]]; })());
    const others = !eph ? [] : ({ earth: ['moon'], moon: ['earth'], sun: ['earth', 'mars', 'venus', 'mercury'], mars: [] }[id] ?? []);
    const pick = thin(S.length, 600);
    const bodies = [{ id, name: BODIES[id].name, radius: BODIES[id].radius, path: null }, ...others.map(b => ({ id: b, name: BODIES[b].name, radius: BODIES[b].radius, path: flat(pick.map(i => eph.rel(b, id, t0 + S[i].t).slice(0, 3))), pathIndex: pick }))];
    return { id, label: `${BODIES[id].name}-centred, non-rotating (ICRF axes)`, track: flat(track), bodies };
  });
}

export function runFlight(scenario, params = {}, eph = null) {
  const p = { ...DEFAULTS[scenario], ...params }, meta = SCENARIOS.find(s => s.id === scenario);
  if (!meta) throw new FlightError('unsupported_mission', `Unknown scenario "${scenario}".`, 'scenario');
  if (meta.needsEphemeris && !eph) throw new FlightError('ephemeris_missing', 'The cached JPL ephemeris could not be loaded.', null, 'Check that /ephemeris/de441_2026_2032.json is served, then retry.');
  let result, plan = null, vehicle, summary, viewIds = ['earth'];
  if (scenario === 'saturn_legacy') {
    result = runSaturnLegacy({ payloadFactor: p.payloadFactor, throttle: p.throttle, pitchFinal: p.pitchFinal, windEast: p.windEast });
    delete result.raw; vehicle = { id: 'saturn_v', name: 'Saturn V (legacy Flight Lab 2.0 model)', classification: 'historical-class approximation', provenance: 'Stage masses, thrust and Isp from the supplied Saturn V Flight Lab 2.0 source; educational reconstruction, not flight telemetry.', ...SATURN_LEGACY_INFO }; summary = result.summary;
  } else if (scenario === 'sixdof') {
    const d = p.duration_s;
    result = runSixDof({ mass_kg: p.mass_kg, inertia_kg_m2: [p.ix, p.iy, p.iz], duration_s: d, omega0_body_rad_s: [p.wx, p.wy, p.wz],
      thruster: { thrust_n: p.thrust_n, isp_s: 300, position_body_m: [-2, p.offset_m, 0], direction_body: [1, 0, 0] },
      segments: [{ t0: 0.3 * d, t1: 0.4 * d, torque_body_n_m: [0, p.torque_n_m, 0], label: 'Control torque pulse (+y)' }, { t0: 0.6 * d, t1: 0.7 * d, thrust: true, label: 'Off-axis thruster burn' }] });
    vehicle = { id: 'sixdof_demo', name: 'Hypothetical 6-DOF demonstrator', classification: 'hypothetical', provenance: 'Invented rigid body for demonstrating rotational dynamics; not a real spacecraft.' };
    const a = result.samples[0], b = result.samples.at(-1);
    summary = { duration_s: b.t, final_altitude_km: b.alt / 1000, final_mass_kg: b.m, final_body_rate_rad_s: norm(b.omega_body), angular_momentum_change_rel: b.L_mag / a.L_mag - 1 };
  } else {
    let mission;
    if (scenario === 'leo') { vehicle = cloneVehicle('orbital_lab'); mission = leoCoast({ epoch_utc: p.epoch_utc, vehicle, altitude_m: p.altitude_km * 1000, inclination_deg: p.inclination_deg, orbits: p.orbits, drag: p.drag, j2: p.j2, burn_dv_m_s: p.burn_dv_m_s }); }
    else if (scenario === 'lunar') { vehicle = cloneVehicle('apollo_tli_stack'); ({ mission, plan } = planLunarTransfer(eph, { epoch_utc: p.epoch_utc, vehicle, parking_alt_m: p.parking_alt_km * 1000, perilune_alt_m: p.perilune_alt_km * 1000, tli_dv_m_s: p.tli_dv_m_s, insert: p.insert })); viewIds = ['earth', 'moon']; }
    else if (scenario === 'free') { vehicle = cloneVehicle('orbital_lab'); const b = BODIES[p.body]; if (!b || !['earth', 'moon', 'mars'].includes(p.body)) throw new FlightError('unsupported_body', `Body "${p.body}" is not supported for a custom state.`, 'body', 'Choose earth, moon or mars.');
      const a = b.radius + (p.periapsis_alt_km + p.apoapsis_alt_km) * 500, P = 2 * Math.PI * Math.sqrt(a ** 3 / b.mu);
      const phases = [{ type: 'coast', label: 'Initial orbit coast', until: { type: 'duration', s: P * p.orbits / (p.burn_dv_m_s ? 2 : 1) }, output_dt_s: P / 300 }];
      if (p.burn_dv_m_s) phases.push({ type: 'burn', label: 'Prograde burn', attitude: { mode: 'prograde' }, until: { type: 'dv', value_m_s: p.burn_dv_m_s }, output_dt_s: 1 }, { type: 'coast', label: 'Coast after burn', until: { type: 'duration', s: P * p.orbits / 2 }, output_dt_s: P / 300 });
      mission = { name: `Free flight at ${b.name}`, kind: 'free_flight', epoch_utc: p.epoch_utc, centre: p.body, vehicle, forces: { drag: true, j2: p.body === 'earth', third_bodies: true },
        initial: { type: 'orbit', body: p.body, periapsis_alt_m: p.periapsis_alt_km * 1000, apoapsis_alt_m: p.apoapsis_alt_km * 1000, inclination_deg: p.inclination_deg, raan_deg: 0, true_anomaly_deg: 0 }, phases };
      viewIds = [p.body]; }
    else { vehicle = cloneVehicle('mars_probe'); ({ mission, plan } = planEarthMars(eph, { epoch_utc: p.epoch_utc, tof_days: p.tof_days, vehicle })); viewIds = ['sun', 'earth', 'mars']; }
    result = runMission(mission, eph, { maxSamples: 12000 }); summary = summarize(result);
    result.mission_name = mission.name;
  }
  result.views = views(result, scenario === 'saturn_legacy' || scenario === 'sixdof' ? null : eph, viewIds);
  return { scenario, params: p, meta, vehicle, plan, summary, result };
}
export { VEHICLES };
