/** Adapter: runs the unchanged legacy Saturn V model and exposes its output in the common telemetry format. */
import { simulate, diagnostics, CONSTANTS, V } from './legacy/saturnPhysics.mjs';

export const LEGACY_MODEL = 'Legacy Saturn V Flight Lab 2.0: Earth-centred inertial 3-DOF point mass, fixed-step RK4, approximate atmosphere and aerodynamics, programmed pitch (original physics.mjs, unmodified)';
export const LEGACY_ASSUMPTIONS = [
  'Educational reconstruction; not historical telemetry and not a certified trajectory',
  'Point-mass 3-DOF; attitude follows a commanded pitch programme with an angle-of-attack limiter (no rotational dynamics)',
  'Atmosphere: COESA-1976-like layers with exponential extension; drag coefficient is an approximate Mach curve, not Saturn V wind-tunnel data',
  'Earth-centred frame with spherical Earth radius 6371 km, optional J2; launch latitude 28.6084 deg',
  'Stage masses and engine values are rounded public figures (see source comments)',
];

export function runSaturnLegacy(config = {}) {
  const res = simulate(config);
  const samples = res.samples.map(s => {
    const idx = s.stage, stage = res.stages[Math.min(idx, 2)];
    const d = diagnostics([...s.r, ...s.v, s.m], res.config, stage, idx, s.t, s.engine);
    const ax = V.dot(d.accelNonGrav, d.body), lat = V.mag(V.sub(d.accelNonGrav, V.mul(d.body, ax)));
    return { t: s.t, centre: 'earth', r: s.r, v: s.v, m: s.m, alt: s.alt, speed: s.speed, stage: idx, burning: !!s.engine, specific_force_body: [ax, lat, 0], body_x: d.body,
      q_pa: s.q, mach: s.M, g_load: s.gLoad, thrust_n: s.thrust, drag_n: s.drag, pitch_deg: s.pitch, range_m: s.range,
      periapsis_alt: s.orbit.perigee, apoapsis_alt: s.orbit.apogee, ecc: s.orbit.eccentricity, inc_deg: s.orbit.inclination };
  });
  return { status: 'completed', engine: 'saturn-legacy-2.0', model: LEGACY_MODEL, assumptions: LEGACY_ASSUMPTIONS, config: res.config, samples,
    events: res.events.map(e => ({ t: e.t, type: e.type, text: e.text, centre: 'earth' })), ended: res.ended,
    frames: { axes: 'Earth-centred inertial (legacy convention: z = rotation axis, x through launch meridian at t = 0)', time: 'seconds from ignition', body: 'x = thrust axis; y = lateral (magnitude of off-axis specific force)' },
    summary: { launch_mass_kg: res.launchMass, payload_kg: res.payload, ideal_dv_m_s: res.idealDV, max_q_pa: res.maxQ.value, max_q_t: res.maxQ.t, max_g: res.maxG.value, max_alt_m: res.maxAlt.value,
      perigee_alt_m: res.orbit.perigee, apogee_alt_m: res.orbit.apogee, eccentricity: res.orbit.eccentricity, inclination_deg: res.orbit.inclination, orbital: res.orbit.orbital, liftoff_thrust_to_weight: res.twAtLiftoff },
    raw: res };
}
export { CONSTANTS as LEGACY_CONSTANTS };
