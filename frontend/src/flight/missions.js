/** Mission planners. Planners only produce an initial guess and a phase list; every reported result comes from running the plan through runMission. */
import { BODIES, DAY, FlightError, add, sub, mul, dot, cross, norm, unit, lambert, tdbFromUtc, utcFromTdb, elements } from './core.js';
import { runMission } from './engine.js';
import { cloneVehicle } from './vehicles.js';

const R2D = 180 / Math.PI;

export function leoCoast({ epoch_utc = '2026-11-20T00:00:00Z', vehicle = cloneVehicle('orbital_lab'), altitude_m = 400e3, inclination_deg = 51.6, orbits = 2, drag = true, j2 = true, burn_dv_m_s = 0 } = {}) {
  const b = BODIES.earth, P = 2 * Math.PI * Math.sqrt((b.radius + altitude_m) ** 3 / b.mu);
  const phases = [{ type: 'coast', label: 'Parking orbit coast', until: { type: 'duration', s: P * orbits / (burn_dv_m_s ? 2 : 1) }, output_dt_s: 20 }];
  if (burn_dv_m_s) phases.push({ type: 'burn', label: 'Orbit-raise burn', attitude: { mode: 'prograde' }, until: { type: 'dv', value_m_s: burn_dv_m_s }, output_dt_s: 1 }, { type: 'coast', label: 'Coast after burn', until: { type: 'duration', s: P * orbits / 2 }, output_dt_s: 20 });
  return { name: 'Low Earth orbit coast', kind: 'leo_coast', epoch_utc, centre: 'earth', vehicle, forces: { drag, j2, third_bodies: true },
    initial: { type: 'orbit', body: 'earth', periapsis_alt_m: altitude_m, inclination_deg, raan_deg: 40, true_anomaly_deg: 0 }, phases };
}

/** Lunar transfer: parking orbit coplanar with the Moon's geocentric orbit plane at arrival; 1-D search on the coast time before TLI for the requested perilune altitude. */
export function planLunarTransfer(eph, { epoch_utc = '2026-11-20T00:00:00Z', vehicle = cloneVehicle('apollo_tli_stack'), parking_alt_m = 185e3, perilune_alt_m = 110e3, tli_dv_m_s = 3150, lunar_orbit_apoapsis_alt_m = 300e3, insert = true } = {}) {
  const t0 = tdbFromUtc(epoch_utc), mE = BODIES.earth, mM = BODIES.moon;
  const sM = eph.rel('moon', 'earth', t0 + 3.2 * DAY), n = unit(cross(sM.slice(0, 3), sM.slice(3)));
  const inc = Math.acos(n[2]) * R2D, node = cross([0, 0, 1], n);
  let raan = Math.atan2(node[1], node[0]) * R2D; if (raan < 0) raan += 360;
  const P = 2 * Math.PI * Math.sqrt((mE.radius + parking_alt_m) ** 3 / mE.mu);
  const initial = { type: 'orbit', body: 'earth', periapsis_alt_m: parking_alt_m, inclination_deg: inc, raan_deg: raan, true_anomaly_deg: 0 };
  const base = { epoch_utc, centre: 'earth', vehicle, forces: { j2: false, drag: false, third_bodies: true }, initial };
  let evals = 0;
  const miss = tauIn => {
    const tau = ((tauIn % P) + P) % P; evals++;
    const r = runMission({ ...base, phases: [{ type: 'coast', until: { type: 'duration', s: tau } }, { type: 'burn', until: { type: 'dv', value_m_s: tli_dv_m_s } },
      { type: 'coast', until: { type: 'duration', s: 1.5 * DAY }, output_dt_s: 1e6 },
      { type: 'coast', until: { type: 'closest_approach', body: 'moon' }, max_duration_s: 9 * DAY, output_dt_s: 1e6 }] }, eph, { maxSamples: 50 });
    if (r.phases[1].outcome !== 'condition') throw new FlightError('insufficient_propellant', `The vehicle cannot deliver the ${tli_dv_m_s} m/s translunar injection (propellant depleted after ${r.phases[1].dv_thrust.toFixed(0)} m/s).`, 'vehicle', 'Reduce payload, add propellant or lower the injection delta-v.');
    if (r.phases[3].outcome !== 'condition') return 1e12;
    const s = eph.rel('moon', 'earth', tdbFromUtc(epoch_utc) + r.final.t);
    return norm(sub(r.final.r, s.slice(0, 3)));
  };
  let best = { tau: 0, d: Infinity }; const N = 36;
  for (let i = 0; i < N; i++) { const tau = P * i / N, d = miss(tau); if (d < best.d) best = { tau, d }; }
  let a = best.tau - P / N, b = best.tau + P / N; const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a), d = a + gr * (b - a), fc = miss(c), fd = miss(d);
  for (let i = 0; i < 40 && b - a > 0.02; i++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = miss(c); } else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = miss(d); } }
  const tauMin = 0.5 * (a + b), dMin = miss(tauMin), target = mM.radius + perilune_alt_m;
  let tau = tauMin, achieved = dMin;
  if (dMin < target) {   // move to the side of the minimum that gives the requested perilune radius
    let lo = tauMin, hi = tauMin + P / N; let fhi = miss(hi);
    for (let i = 0; i < 8 && fhi < target; i++) { hi += P / N; fhi = miss(hi); }
    if (fhi >= target) { for (let i = 0; i < 50 && hi - lo > 1e-3; i++) { const m = 0.5 * (lo + hi); if (miss(m) < target) lo = m; else hi = m; } tau = 0.5 * (lo + hi); achieved = miss(tau); }
  }
  const phases = [
    { type: 'coast', label: 'Parking orbit coast to injection point', until: { type: 'duration', s: ((tau % P) + P) % P }, output_dt_s: 20 },
    { type: 'burn', label: 'Translunar injection', attitude: { mode: 'prograde' }, until: { type: 'dv', value_m_s: tli_dv_m_s }, output_dt_s: 2 },
    { type: 'jettison', label: 'Injection stage separation' },
    { type: 'coast', label: 'Translunar coast', until: { type: 'distance_to', body: 'moon', value_m: mM.soi }, max_duration_s: 10 * DAY, output_dt_s: 900 },
    { type: 'recenter', body: 'moon' },
    { type: 'coast', label: 'Approach to perilune', until: { type: 'periapsis' }, max_duration_s: 2 * DAY, output_dt_s: 300 },
  ];
  let loi = null;
  if (insert) {
    // Centre the finite insertion burn on perilune: estimate its duration from the propagated perilune state.
    const trial = runMission({ ...base, phases }, eph, { maxSamples: 50 });
    if (trial.phases.at(-1).outcome !== 'condition') throw new FlightError('plan_failed', 'The planned trajectory does not reach a perilune.', 'plan');
    const rpM = mM.radius + trial.final.alt, vPeri = norm(trial.final.v), raM = mM.radius + lunar_orbit_apoapsis_alt_m;
    const vTarget = Math.sqrt(2 * mM.mu * raM / (rpM * (rpM + raM))), dv = vPeri - vTarget, eng = vehicle.stages[1], ve = eng.isp_vac_s * 9.80665;
    const tb = trial.final.m * (1 - Math.exp(-dv / ve)) * ve / eng.thrust_vac_n, approach = trial.phases.at(-1);
    loi = { impulsive_dv_m_s: dv, estimated_burn_s: tb, perilune_alt_m: trial.final.alt };
    phases[phases.length - 1] = { type: 'coast', label: 'Approach to insertion point', until: { type: 'duration', s: approach.t_end - approach.t_start - tb / 2 }, output_dt_s: 300 };
    phases.push({ type: 'burn', label: 'Lunar orbit insertion (centred on perilune)', attitude: { mode: 'retrograde' }, until: { type: 'dv', value_m_s: dv }, output_dt_s: 2 },
      { type: 'coast', label: 'Lunar orbit', until: { type: 'duration', s: 6 * 3600 }, output_dt_s: 30 });
  }
  else phases.push({ type: 'coast', label: 'Lunar flyby departure', until: { type: 'duration', s: 1 * DAY }, output_dt_s: 300 });
  return { mission: { name: insert ? 'Lunar transfer and orbit insertion' : 'Lunar flyby', kind: 'lunar_transfer', ...base, phases },
    plan: { method: 'Parking orbit placed in the Moon\'s geocentric orbit plane at arrival; golden-section + bisection search on pre-injection coast time using full N-body propagation', evaluations: evals,
      parking_inclination_deg: inc, parking_raan_deg: raan, coast_before_tli_s: tau, tli_dv_m_s, targeted_perilune_alt_m: perilune_alt_m, planned_closest_approach_alt_m: achieved - mM.radius,
      target_met: Math.abs(achieved - target) < 2000, lunar_orbit_insertion: loi, note: dMin >= target ? 'The requested perilune could not be bracketed; closest achievable approach is reported.' : null } };
}

/** Earth-Mars transfer: Lambert initial guess, finite departure burn from a parking orbit, two Lambert-retargeted trim burns, ends at the Mars atmospheric interface (no entry model). */
export function planEarthMars(eph, { epoch_utc = '2026-11-14T00:00:00Z', tof_days = 250, vehicle = cloneVehicle('mars_probe'), parking_alt_m = 300e3, interface_alt_m = 125e3, tcm_days = [20, null] } = {}) {
  const t0 = tdbFromUtc(epoch_utc), tA = t0 + tof_days * DAY, muS = BODIES.sun.mu, mE = BODIES.earth;
  const e0 = eph.rel('earth', 'sun', t0), mA = eph.rel('mars', 'sun', tA);
  const L = lambert(e0.slice(0, 3), mA.slice(0, 3), tof_days * DAY, muS);
  const vinf = sub(L.v1, e0.slice(3)), vi = norm(vinf), s = unit(vinf), c3 = vi * vi;
  const rp = mE.radius + parking_alt_m, vc = Math.sqrt(mE.mu / rp), vp = Math.sqrt(vi * vi + 2 * mE.mu / rp), dvImp = vp - vc, e = 1 + rp * vi * vi / mE.mu, thInf = Math.acos(-1 / e);
  const hhat = unit(cross(s, cross([0, 0, 1], s))), hs = cross(hhat, s);
  const phat = sub(mul(s, Math.cos(thInf)), mul(hs, Math.sin(thInf))), qhat = cross(hhat, phat);
  const st = vehicle.stages[0], m0 = vehicle.payload_kg + vehicle.stages.reduce((a, x) => a + x.dry_kg + x.prop_kg, 0);
  const ve = st.isp_vac_s * 9.80665, tb = m0 * (1 - Math.exp(-dvImp / ve)) * ve / st.thrust_vac_n, nOrb = vc / rp, pre = 900;
  const phi = -(nOrb * (pre + 0.5 * tb));
  const initial = { type: 'cartesian', body: 'earth', r_m: add(mul(phat, rp * Math.cos(phi)), mul(qhat, rp * Math.sin(phi))), v_m_s: add(mul(phat, -vc * Math.sin(phi)), mul(qhat, vc * Math.cos(phi))) };
  const base = { epoch_utc, centre: 'earth', vehicle, forces: { j2: false, drag: false, third_bodies: true }, initial };
  const phases = [
    { type: 'coast', label: 'Parking orbit coast', until: { type: 'duration', s: pre }, output_dt_s: 20 },
    { type: 'burn', label: 'Trans-Mars injection', attitude: { mode: 'prograde' }, until: { type: 'osculating', quantity: 'energy', value: c3 / 2, direction: 'up' }, output_dt_s: 5 },
    { type: 'jettison', label: 'Kick stage separation' },
    { type: 'coast', label: 'Earth departure', until: { type: 'duration', s: 4 * DAY }, output_dt_s: 3600 },
    { type: 'recenter', body: 'sun' },
    { type: 'coast', label: 'Early cruise', until: { type: 'duration', s: (tcm_days[0] ?? 20) * DAY - 4 * DAY - pre - tb }, output_dt_s: 6 * 3600 },
  ];
  const tcms = [];
  const addTcm = (label) => {
    const r = runMission({ ...base, phases }, eph, { maxSamples: 4000 });
    if (r.phases[1].outcome === 'depletion') throw new FlightError('insufficient_propellant', `The kick stage is depleted before reaching C3 = ${(c3 / 1e6).toFixed(2)} km^2/s^2.`, 'vehicle', 'Reduce payload or choose another departure date / time of flight.');
    const tNow = t0 + r.final.t, mNow = eph.rel('mars', 'sun', tA);
    const Lc = lambert(r.final.r, mNow.slice(0, 3), tA - tNow, muS), dv = sub(Lc.v1, r.final.v), mag = norm(dv);
    tcms.push({ label, t_days: r.final.t / DAY, dv_m_s: mag });
    if (mag > 1e-3) phases.push({ type: 'burn', label, attitude: { mode: 'inertial', vector: unit(dv) }, until: { type: 'dv', value_m_s: mag }, output_dt_s: 5, h0_s: 0.5 });
  };
  addTcm('Trajectory correction 1 (Lambert retarget)');
  const t2 = tcm_days[1] ?? Math.round(tof_days * 0.6);
  phases.push({ type: 'coast', label: 'Interplanetary cruise', until: { type: 'duration', s: t2 * DAY - (tcm_days[0] ?? 20) * DAY }, output_dt_s: DAY });
  addTcm('Trajectory correction 2 (Lambert retarget)');
  phases.push({ type: 'coast', label: 'Cruise to Mars sphere of influence', until: { type: 'distance_to', body: 'mars', value_m: BODIES.mars.soi }, max_duration_s: (tof_days - t2 + 30) * DAY, output_dt_s: DAY },
    { type: 'recenter', body: 'mars' },
    { type: 'coast', label: 'Mars approach', until: { type: 'altitude', value_m: interface_alt_m, direction: 'down' }, max_duration_s: 10 * DAY, output_dt_s: 1800 });
  return { mission: { name: 'Earth-Mars transfer (bounded example)', kind: 'earth_mars_transfer', ...base, phases },
    plan: { method: 'Single-revolution Lambert arc Earth(t0) -> Mars(t0 + TOF) for the departure hyperbola; finite injection burn centred on the hyperbola periapsis; two Lambert-retargeted trim burns computed from the propagated N-body state',
      departure_utc: epoch_utc, arrival_utc: utcFromTdb(tA), tof_days, c3_km2_s2: c3 / 1e6, v_inf_m_s: vi, impulsive_injection_dv_m_s: dvImp, estimated_burn_s: tb, parking_inclination_deg: Math.acos(hhat[2]) * R2D, tcms,
      bounded: 'Ends at the Mars atmospheric-interface altitude. Capture, entry, descent and landing are NOT modelled. Launch windows are not optimised: the user chooses date and time of flight.' } };
}

export function summarize(result) {
  const cb = BODIES[result.final.centre];
  return { ended: result.ended, final_centre: cb.name, final_altitude_km: result.final.alt / 1000, final_speed_m_s: norm(result.final.v), periapsis_alt_km: result.final.periapsis_alt / 1000,
    apoapsis_alt_km: Number.isFinite(result.final.apoapsis_alt) ? result.final.apoapsis_alt / 1000 : null, eccentricity: result.final.ecc, inclination_deg: result.final.inc_deg,
    duration_days: result.final.t / DAY, dv_used_m_s: result.accounting.dv_thrust_m_s, final_mass_kg: result.final.m };
}
