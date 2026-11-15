/** Mission runner: translational (3-DOF) N-body propagation with finite burns, staging, drag and events.
 *  Propagation is performed relative to a chosen central body (ICRF axes) with exact third-body
 *  differential accelerations from the ephemeris. State y = [r(3), v(3), m, dv_thrust, dv_drag]. */
import { BODIES, G0, SUPPORTED_CENTRES, FlightError, add, sub, mul, dot, cross, norm, unit, dp5Step, elements, density, bodyFixedToInertial, stateFromElements, tdbFromUtc, utcFromTdb } from './core.js';

export const ENGINE_VERSION = 'solaris-flight-1.0';
const PERTURBERS = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const fin = v => Number.isFinite(v);

export function validateVehicle(v) {
  const bad = (f, m) => { throw new FlightError('invalid_vehicle', m, 'vehicle.' + f); };
  if (!v || !Array.isArray(v.stages) || !v.stages.length) bad('stages', 'Vehicle needs at least one stage.');
  if (!(fin(v.payload_kg) && v.payload_kg >= 0)) bad('payload_kg', 'Payload mass must be >= 0.');
  v.stages.forEach((s, i) => {
    for (const k of ['dry_kg', 'prop_kg', 'thrust_vac_n', 'isp_vac_s']) if (!(fin(s[k]) && s[k] >= 0)) bad(`stages[${i}].${k}`, `Stage ${i + 1} ${k} must be a finite non-negative number.`);
    if (s.thrust_vac_n > 0 && !(s.isp_vac_s > 0)) bad(`stages[${i}].isp_vac_s`, 'Specific impulse must be > 0 for a thrusting stage.');
    if (s.isp_vac_s > 20000) bad(`stages[${i}].isp_vac_s`, 'Specific impulse above 20000 s is outside the supported range.');
  });
  if (!(v.payload_kg + v.stages.reduce((a, s) => a + s.dry_kg, 0) > 0)) bad('payload_kg', 'Vehicle dry mass must be positive.');
  return v;
}
export const vehicleMass = (v, from = 0, props = null) => v.payload_kg + v.stages.slice(from).reduce((a, s, i) => a + s.dry_kg + (props ? props[from + i] : s.prop_kg), 0);
export const idealDeltaV = v => { let dv = 0; v.stages.forEach((s, i) => { const m0 = vehicleMass(v, i); dv += s.isp_vac_s * G0 * Math.log(m0 / (m0 - s.prop_kg)); }); return dv; };

/** Initial state relative to the mission centre. */
export function initialState(init, eph, t0) {
  const b = BODIES[init.body];
  if (!b || !SUPPORTED_CENTRES.includes(init.body)) throw new FlightError('unsupported_body', `Initial body "${init.body}" is not supported.`, 'initial.body', 'Supported: ' + SUPPORTED_CENTRES.join(', '));
  if (init.type === 'orbit') {
    const rp = b.radius + init.periapsis_alt_m, ra = b.radius + (init.apoapsis_alt_m ?? init.periapsis_alt_m);
    if (![rp, ra, init.inclination_deg, init.raan_deg ?? 0, init.arg_periapsis_deg ?? 0, init.true_anomaly_deg ?? 0].every(fin)) throw new FlightError('invalid_state', 'Orbit elements must be finite numbers.', 'initial');
    if (init.body !== 'sun' && init.periapsis_alt_m < 0) throw new FlightError('invalid_state', 'Periapsis is below the surface.', 'initial.periapsis_alt_m');
    if (ra < rp) throw new FlightError('invalid_state', 'Apoapsis must not be below periapsis.', 'initial.apoapsis_alt_m');
    const a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), D = Math.PI / 180;
    const s = stateFromElements({ a, e, inc: init.inclination_deg * D, raan: (init.raan_deg ?? 0) * D, argp: (init.arg_periapsis_deg ?? 0) * D, nu: (init.true_anomaly_deg ?? 0) * D }, b.mu);
    return { r: s.r, v: s.v, landed: false };
  }
  if (init.type === 'cartesian') {
    if (![...init.r_m, ...init.v_m_s].every(fin) || init.r_m.length !== 3 || init.v_m_s.length !== 3) throw new FlightError('invalid_state', 'Cartesian state must be six finite numbers.', 'initial');
    if (init.body !== 'sun' && norm(init.r_m) < b.radius) throw new FlightError('invalid_state', 'Initial position is inside the body.', 'initial.r_m');
    return { r: [...init.r_m], v: [...init.v_m_s], landed: false };
  }
  if (init.type === 'surface') {
    if (!b.rotation) throw new FlightError('unsupported_state', `Surface states are not supported on ${b.name}.`, 'initial.body');
    const D = Math.PI / 180, lat = init.latitude_deg * D, lon = init.longitude_deg * D, alt = init.altitude_m ?? 0;
    if (![lat, lon, alt].every(fin) || Math.abs(init.latitude_deg) > 90) throw new FlightError('invalid_state', 'Latitude/longitude/altitude are invalid.', 'initial');
    const F = bodyFixedToInertial(init.body, t0), R = b.radius + alt;
    const loc = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    const r = mul(add(add(mul(F.x, loc[0]), mul(F.y, loc[1])), mul(F.z, loc[2])), R);
    return { r, v: cross(F.omega, r), landed: true };
  }
  throw new FlightError('invalid_state', `Unknown initial state type "${init.type}".`, 'initial.type');
}

function attitudeDir(law, r, v, centre, t) {
  switch (law?.mode ?? 'prograde') {
    case 'prograde': return unit(v);
    case 'retrograde': return mul(unit(v), -1);
    case 'radial_out': return unit(r);
    case 'radial_in': return mul(unit(r), -1);
    case 'normal': return unit(cross(r, v));
    case 'antinormal': return mul(unit(cross(r, v)), -1);
    case 'inertial': return unit(law.vector);
    default: throw new FlightError('invalid_attitude', `Unknown attitude law "${law.mode}".`, 'attitude.mode');
  }
}

/** Run a mission. Returns telemetry, events, mass/delta-v accounting and diagnostics. Pure function of its inputs (deterministic). */
export function runMission(mission, eph, opts = {}) {
  const veh = validateVehicle(mission.vehicle);
  let centre = mission.centre;
  if (!SUPPORTED_CENTRES.includes(centre)) throw new FlightError('unsupported_body', `Propagation centre "${centre}" is not supported.`, 'centre');
  let t = tdbFromUtc(mission.epoch_utc); const tEpoch = t;
  if (t < eph.tMin || t > eph.tMax) eph.state('earth', t);   // throws the range error
  const F = mission.forces ?? {};
  const tol = { rel: mission.numerics?.rel_tol ?? 1e-10, abs: [1e-3, 1e-3, 1e-3, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6, 1e-6] };
  const init = initialState({ ...mission.initial, body: mission.initial.body ?? centre }, eph, t);
  let r = init.r, v = init.v;
  if ((mission.initial.body ?? centre) !== centre) { const s = eph.rel(mission.initial.body, centre, t); r = add(r, s.slice(0, 3)); v = add(v, s.slice(3)); }
  const props = veh.stages.map(s => s.prop_kg);
  let stage = 0;
  let y = [...r, ...v, vehicleMass(veh, 0, props), 0, 0];
  const samples = [], events = [], phasesOut = [];
  let rhsCalls = 0, steps = 0, rejectedNote = null;
  const wind = F.wind_east_m_s ?? 0;
  const maxSamples = opts.maxSamples ?? 20000;

  const accel = (tt, yy, burn) => {
    const rr = [yy[0], yy[1], yy[2]], vv = [yy[3], yy[4], yy[5]], m = yy[6], R = norm(rr), cb = BODIES[centre];
    let a = mul(rr, -cb.mu / (R * R * R));
    if (F.third_bodies !== false) {
      const c = eph.state(centre, tt), s = new Array(6);
      for (const p of PERTURBERS) {
        if (p === centre) continue;
        eph.state(p, tt, s);
        const sx = s[0] - c[0], sy = s[1] - c[1], sz = s[2] - c[2], dx = sx - rr[0], dy = sy - rr[1], dz = sz - rr[2];
        const d3 = Math.pow(dx * dx + dy * dy + dz * dz, 1.5), s3 = Math.pow(sx * sx + sy * sy + sz * sz, 1.5), mu = BODIES[p].mu;
        a[0] += mu * (dx / d3 - sx / s3); a[1] += mu * (dy / d3 - sy / s3); a[2] += mu * (dz / d3 - sz / s3);
      }
    }
    if (F.j2 && cb.j2) {   // pole taken as ICRF z (precession/nutation neglected)
      const k = 1.5 * cb.j2 * cb.mu * cb.radius ** 2 / R ** 5, z2 = rr[2] * rr[2] / (R * R);
      a[0] += k * rr[0] * (5 * z2 - 1); a[1] += k * rr[1] * (5 * z2 - 1); a[2] += k * rr[2] * (5 * z2 - 3);
    }
    let fng = [0, 0, 0], dragAcc = 0, thrustAcc = 0, mdot = 0, rho = 0;
    if (F.drag && cb.atmosphere) {
      rho = density(cb.atmosphere, R - cb.radius);
      if (rho > 0) {
        const om = cb.rotation ? bodyFixedToInertial(centre, tt).omega : [0, 0, 0];
        let vrel = sub(vv, cross(om, rr));
        if (wind) vrel = sub(vrel, mul(unit(cross(om, rr)), wind));
        const va = norm(vrel), k = -0.5 * rho * va * (veh.cd ?? 2.2) * (veh.area_m2 ?? 10) / m;
        fng = mul(vrel, k); dragAcc = norm(fng);
      }
    }
    let dir = null;
    if (burn) {
      const s = veh.stages[stage]; dir = attitudeDir(burn.attitude, rr, vv, centre, tt);
      const T = s.thrust_vac_n * (burn.throttle ?? 1); thrustAcc = T / m; mdot = T / (s.isp_vac_s * G0);
      fng = add(fng, mul(dir, thrustAcc));
    }
    return { a: add(a, fng), fng, thrustAcc, dragAcc, mdot, rho, dir };
  };
  const rhs = burn => (tt, yy) => { rhsCalls++; const q = accel(tt, yy, burn); return [yy[3], yy[4], yy[5], q.a[0], q.a[1], q.a[2], -q.mdot, q.thrustAcc, q.dragAcc]; };

  const record = (tt, yy, burn, phaseIndex, force = false) => {
    if (!force && samples.length >= maxSamples) { rejectedNote = `Telemetry limited to ${maxSamples} samples.`; return; }
    const rr = yy.slice(0, 3), vv = yy.slice(3, 6), cb = BODIES[centre], q = accel(tt, yy, burn), el = elements(rr, vv, cb.mu);
    const x = q.dir ?? attitudeDir(burn?.attitude ?? mission.coast_attitude ?? { mode: 'prograde' }, rr, vv, centre, tt);
    let yb; try { yb = unit(cross(cross(rr, vv), x)); } catch { yb = unit(cross([0, 0, 1], x)); }
    const zb = cross(x, yb);
    samples.push({ t: tt - tEpoch, utc: utcFromTdb(tt), centre, phase: phaseIndex, r: rr, v: vv, m: yy[6], alt: norm(rr) - cb.radius, speed: norm(vv), stage, burning: !!burn,
      thrust_acc: q.thrustAcc, drag_acc: q.dragAcc, rho: q.rho, specific_force_body: [dot(q.fng, x), dot(q.fng, yb), dot(q.fng, zb)], body_x: x,
      dv_thrust: yy[7], dv_drag: yy[8], sma: el.a, ecc: el.e, inc_deg: el.inc * 180 / Math.PI, periapsis_alt: el.rp - cb.radius, apoapsis_alt: el.ra - cb.radius, energy: el.energy, h: el.h });
  };
  const ev = (tt, type, text, extra = {}) => events.push({ t: tt - tEpoch, utc: utcFromTdb(tt), type, text, centre, ...extra });

  const condFn = (until, burn) => {
    const cb = () => BODIES[centre];
    switch (until.type) {
      case 'duration': case 'time': return null;
      case 'periapsis': return { g: (tt, yy) => dot(yy.slice(0, 3), yy.slice(3, 6)), dir: 1 };
      case 'apoapsis': return { g: (tt, yy) => dot(yy.slice(0, 3), yy.slice(3, 6)), dir: -1 };
      case 'altitude': return { g: (tt, yy) => norm(yy) - cb().radius - until.value_m, dir: until.direction === 'up' ? 1 : -1 };
      case 'distance_to': return { g: (tt, yy) => norm(sub(yy.slice(0, 3), eph.rel(until.body, centre, tt).slice(0, 3))) - until.value_m, dir: -1 };
      case 'closest_approach': return { g: (tt, yy) => { const s = eph.rel(until.body, centre, tt); return dot(sub(yy.slice(0, 3), s.slice(0, 3)), sub(yy.slice(3, 6), s.slice(3))); }, dir: 1 };
      case 'dv': return { g: (tt, yy) => yy[7] - until._dv0 - until.value_m_s, dir: 1 };
      case 'osculating': return { g: (tt, yy) => { const el = elements(yy.slice(0, 3), yy.slice(3, 6), cb().mu); const q = until.quantity === 'apoapsis_alt' ? (el.e < 1 ? el.ra - cb().radius : 1e30) : until.quantity === 'periapsis_alt' ? el.rp - cb().radius : until.quantity === 'ecc' ? el.e : el.energy; return q - until.value; }, dir: until.direction === 'down' ? -1 : 1 };
      case 'depletion': return null;
      default: throw new FlightError('invalid_phase', `Unknown termination "${until.type}".`, 'phases.until.type');
    }
  };

  const propagate = (phase, pi, burn) => {
    const until = phase.until ?? { type: 'duration', s: 0 };
    if (until.type === 'dv') until._dv0 = y[7];
    let tEnd = t + (until.type === 'duration' ? until.s : until.type === 'time' ? tdbFromUtc(until.utc) - t : (phase.max_duration_s ?? (burn ? 1e5 : 400 * 86400)));
    if (!(tEnd >= t)) throw new FlightError('invalid_phase', 'Phase end time is before its start.', `phases[${pi}].until`);
    let depletes = false;
    if (burn) {
      const s = veh.stages[stage], mdot = s.thrust_vac_n * (burn.throttle ?? 1) / (s.isp_vac_s * G0);
      const tb = props[stage] / mdot;
      if (t + tb <= tEnd) { tEnd = t + tb; depletes = true; }
    }
    const cond = condFn(until, burn), f = rhs(burn);
    const impact = centre !== 'sun' ? { g: (tt, yy) => norm(yy) - BODIES[centre].radius, dir: -1 } : null;
    const dtOut = phase.output_dt_s ?? Math.max((tEnd - t) / 240, burn ? 0.5 : 1);
    let nextOut = t + dtOut, h = Math.min(phase.h0_s ?? (burn ? 1 : 30), tEnd - t), fy = f(t, y), reason = until.type === 'duration' || until.type === 'time' ? 'time' : 'max_duration';
    const m0 = y[6]; record(t, y, burn, pi);
    let gPrev = cond ? cond.g(t, y) : 0, iPrev = impact ? impact.g(t, y) : 1;
    const hMax = phase.h_max_s ?? (centre === 'sun' ? 86400 : 3600);
    while (t < tEnd - 1e-9) {
      h = Math.min(h, tEnd - t, hMax);
      const st = dp5Step(f, t, y, h, fy, tol); steps++;
      let tHit = null, why = null;
      const check = (c, g0, label) => {
        if (!c) return;
        const g1 = c.g(st.t, st.y);
        if ((c.dir > 0 ? g0 < 0 && g1 >= 0 : g0 > 0 && g1 <= 0)) {
          let a = t, b = st.t, ga = g0;
          for (let i = 0; i < 60 && b - a > 1e-7; i++) { const mid = 0.5 * (a + b), gm = c.g(mid, st.dense(mid)); if ((ga < 0) === (gm < 0) && gm !== 0) { a = mid; ga = gm; } else b = mid; }
          if (tHit === null || b < tHit) { tHit = b; why = label; }
        }
        return g1;
      };
      const g1 = check(cond, gPrev, 'condition'), i1 = check(impact, iPrev, 'impact');
      const tStop = tHit ?? st.t;
      while (nextOut < tStop - 1e-9) { record(nextOut, st.dense(nextOut), burn, pi); nextOut += dtOut; }
      if (tHit !== null) { y = st.dense(tHit); t = tHit; reason = why; break; }
      t = st.t; y = st.y; fy = st.fNew; h = st.hNext; gPrev = g1 ?? 0; iPrev = i1 ?? 1;
      if (!y.every(fin)) throw new FlightError('integration_failed', `Non-finite state at ${utcFromTdb(t)}.`);
    }
    if (reason === 'time' || reason === 'max_duration') { if (burn && depletes) reason = 'depletion'; }
    if (burn) { props[stage] = Math.max(0, props[stage] - (m0 - y[6])); if (reason === 'depletion') { y[6] = vehicleMass(veh, stage, props.map((p, i) => i === stage ? 0 : p)); props[stage] = 0; } }
    record(t, y, burn, pi, true);
    return reason;
  };

  mission.phases.forEach((phase, pi) => {
    const start = { t: t - tEpoch, m: y[6], dv: y[7] }; let outcome = 'done', note = null;
    if (phase.type === 'coast') {
      const reason = propagate(phase, pi, null);
      outcome = reason; if (reason === 'max_duration') note = `Termination condition "${phase.until.type}" was not reached within the phase limit.`;
      if (reason === 'condition') ev(t, phase.until.type, phase.label ?? `Coast ended: ${phase.until.type}`);
    } else if (phase.type === 'burn') {
      const s = veh.stages[stage];
      if (!s) throw new FlightError('no_stage', 'No stage remains for this burn.', `phases[${pi}]`);
      if (!(s.thrust_vac_n > 0)) throw new FlightError('no_engine', `Stage "${s.name}" has no engine.`, `phases[${pi}]`);
      if (!(props[stage] > 0)) { outcome = 'skipped_no_propellant'; note = `Stage "${s.name}" has no propellant; burn not executed.`; ev(t, 'burn_skipped', note); }
      else {
        const thr = phase.throttle ?? 1;
        if (!(thr > 0 && thr <= 1)) throw new FlightError('invalid_throttle', 'Throttle must be in (0, 1].', `phases[${pi}].throttle`);
        const burn = { attitude: phase.attitude ?? { mode: 'prograde' }, throttle: thr };
        ev(t, 'ignition', `${s.name} ignition` + (phase.label ? ` - ${phase.label}` : ''));
        const reason = propagate(phase, pi, burn);
        outcome = reason;
        if (reason === 'depletion') { ev(t, 'depletion', `${s.name} propellant depleted`); if (phase.until.type !== 'depletion' && phase.until.type !== 'duration') note = 'Propellant ran out before the burn target was met. The vehicle cannot deliver this manoeuvre.'; }
        else ev(t, 'cutoff', `${s.name} cutoff (${reason === 'condition' ? phase.until.type + ' target met' : reason})`);
      }
    } else if (phase.type === 'jettison') {
      if (stage >= veh.stages.length - 1 && !phase.allow_last) throw new FlightError('invalid_phase', 'Cannot jettison the last stage.', `phases[${pi}]`);
      const s = veh.stages[stage], dropped = s.dry_kg + props[stage];
      props[stage] = 0; stage++; y[6] = vehicleMass(veh, stage, props);
      ev(t, 'stage', `${s.name} jettisoned (${dropped.toFixed(0)} kg)`); record(t, y, null, pi, true);
    } else if (phase.type === 'recenter') {
      if (!SUPPORTED_CENTRES.includes(phase.body)) throw new FlightError('unsupported_body', `Centre "${phase.body}" is not supported.`, `phases[${pi}].body`);
      const s = eph.rel(centre, phase.body, t);
      for (let k = 0; k < 6; k++) y[k] += s[k];
      centre = phase.body; ev(t, 'recenter', `Propagation centre changed to ${BODIES[centre].name}`); record(t, y, null, pi, true);
    } else throw new FlightError('invalid_phase', `Unknown phase type "${phase.type}".`, `phases[${pi}].type`);
    phasesOut.push({ index: pi, type: phase.type, label: phase.label ?? null, outcome, note, t_start: start.t, t_end: t - tEpoch, mass_start: start.m, mass_end: y[6], dv_thrust: y[7] - start.dv, centre });
    if (outcome === 'impact') { ev(t, 'impact', `Surface contact with ${BODIES[centre].name}; landing is not modelled. Mission ended.`); }
  });
  const impacted = phasesOut.findIndex(p => p.outcome === 'impact');
  const last = samples.at(-1);
  return {
    status: 'completed', engine: ENGINE_VERSION, model: 'Translational 3-DOF point mass; N-body point-mass gravity (Sun, 8 planets/systems, Moon) from cached JPL Horizons DE441 states; adaptive Dormand-Prince 5(4); bisection event location on dense output',
    epoch_utc: mission.epoch_utc, epoch_tdb_s: tEpoch, frames: { axes: 'ICRF', origin: 'central body of each phase (see sample.centre)', time: 'TDB; t = seconds since mission epoch', body: 'x = thrust/attitude axis, y = orbit-normal x X, z = x X y' },
    samples, events, phases: phasesOut, ended: impacted >= 0 ? 'impact' : 'end_of_plan', truncated_after_phase: impacted >= 0 ? impacted : null,
    final: { centre, r: last.r, v: last.v, m: last.m, t: last.t, utc: last.utc, alt: last.alt, sma: last.sma, ecc: last.ecc, inc_deg: last.inc_deg, periapsis_alt: last.periapsis_alt, apoapsis_alt: last.apoapsis_alt },
    accounting: { initial_mass_kg: vehicleMass(veh), final_mass_kg: last.m, propellant_remaining_kg: [...props], stage_index: stage, dv_thrust_m_s: y[7], dv_drag_loss_m_s: y[8], ideal_dv_capability_m_s: idealDeltaV(veh) },
    numerics: { rel_tol: tol.rel, steps, rhs_calls: rhsCalls, note: rejectedNote },
    forces: { third_bodies: F.third_bodies !== false, j2: !!F.j2, drag: !!F.drag, wind_east_m_s: wind, not_modelled: ['solar radiation pressure', 'relativity', 'non-spherical gravity beyond central-body J2', 'lift', 'nozzle back-pressure', 'attitude dynamics (attitude follows the commanded law instantly)'] },
    ephemeris: eph.meta,
  };
}
