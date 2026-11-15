import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Ephemeris, BODIES, G0, DAY, AU, norm, sub, dot, cross, tdbFromUtc, utcFromTdb, elements, stateFromElements, lambert, bodyFixedToInertial, density, FlightError } from '../src/flight/core.js';
import { runMission, initialState, idealDeltaV, vehicleMass } from '../src/flight/engine.js';
import { planLunarTransfer, planEarthMars, leoCoast } from '../src/flight/missions.js';
import { VEHICLES, cloneVehicle } from '../src/flight/vehicles.js';
import { runSaturnLegacy } from '../src/flight/legacyAdapter.js';
import { runSixDof, qRotate } from '../src/flight/sixdof.js';
import { toExcerpt, flightCsv } from '../src/flight/exports.js';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..', '..');
const eph = new Ephemeris(JSON.parse(fs.readFileSync(path.join(here, '..', 'public', 'ephemeris', 'de441_2026_2032.json'))));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const veh = () => ({ name: 't', payload_kg: 1000, stages: [{ name: 'S1', dry_kg: 2000, prop_kg: 20000, thrust_vac_n: 100000, isp_vac_s: 450 }, { name: 'S2', dry_kg: 500, prop_kg: 1000, thrust_vac_n: 5000, isp_vac_s: 320 }] });
const base = (o = {}) => ({ epoch_utc: '2026-11-20T00:00:00Z', centre: 'earth', vehicle: veh(), forces: { third_bodies: false }, initial: { type: 'orbit', body: 'earth', periapsis_alt_m: 300e3, inclination_deg: 28.5 }, ...o });
const codeOf = fn => { try { fn(); } catch (e) { return e.code; } return null; };
export const benchmarks = [];
const bench = (id, title, metric, value, tolerance, ok, reference) => { benchmarks.push({ id, title, metric, value, tolerance, status: ok ? 'PASS' : 'FAIL', reference, external: false }); assert.ok(ok, `${id}: ${metric} = ${value} (tolerance ${tolerance})`); };

test('legacy Saturn V physics module is byte-identical to the supplied source and GLB is unchanged', () => {
  assert.equal(sha(path.join(here, '../src/flight/legacy/saturnPhysics.mjs')), sha(path.join(root, 'reference/saturn_v_flight_lab_v2/physics.mjs')));
  assert.equal(sha(path.join(here, '../public/models/SaturnV.glb')), '6c44497bce54ee0b09d0edb8e33a6f484762a320dab1c54b383e434f5bba06b5');
});
test('original Saturn V test suite still passes unmodified (16 checks)', () => {
  const out = execFileSync(process.execPath, ['tests.mjs'], { cwd: path.join(root, 'reference/saturn_v_flight_lab_v2'), encoding: 'utf8' });
  assert.match(out, /PASS: 16 independent checks/);
});
test('legacy adapter reproduces the supplied baseline flight CSV', () => {
  const r = runSaturnLegacy();
  const rows = fs.readFileSync(path.join(root, 'reference/saturn_v_flight_lab_v2/reports/baseline_flight.csv'), 'utf8').trim().split(/\r?\n/);
  const head = rows[0].split(','), col = k => head.indexOf(k);
  assert.equal(rows.length - 1, r.samples.length);
  let worst = 0;
  rows.slice(1).forEach((line, i) => { const c = line.split(',').map(Number), s = r.samples[i];
    for (const [k, v] of [['t', s.t], ['alt', s.alt], ['speed', s.speed], ['m', s.m]]) worst = Math.max(worst, Math.abs(c[col(k)] - v) / Math.max(1, Math.abs(v))); });
  bench('FL-SATURN-BASELINE', 'Legacy Saturn V adapter vs supplied baseline_flight.csv', 'max relative difference in t, altitude, speed, mass over all samples', worst, 1e-9, worst < 1e-9, 'Supplied Saturn V Orbital Flight Lab V2 baseline (regression; not historical telemetry)');
  assert.equal(r.summary.orbital, true);
  // specific force on the pad equals thrust/mass along the body axis
  assert.ok(Math.abs(r.samples[0].specific_force_body[0] - r.summary.liftoff_thrust_to_weight * 9.80665) < 0.05);
});

test('ephemeris: range guard, interpolation accuracy and Earth-Moon/Sun distances', () => {
  assert.equal(codeOf(() => eph.state('earth', tdbFromUtc('2040-01-01T00:00:00Z'))), 'ephemeris_range');
  assert.equal(codeOf(() => eph.state('pluto', eph.tMin + 10)), 'unsupported_body');
  // interpolate midway between nodes using only every second node and compare with the stored node
  let worst = 0;
  for (const [name, tolM] of [['moon', 2000], ['earth', 2000], ['mars', 2000]]) {
    const q = eph.b[name];
    for (let i = 101; i < 400; i += 37) {
      const coarse = { ...q, h: q.h * 2, n: Math.floor(q.n / 2), s: Float64Array.from({ length: Math.floor(q.n / 2) * 6 }, (_, k) => q.s[Math.floor(k / 6) * 12 + k % 6]) };
      const e2 = Object.create(eph); e2.b = { [name]: coarse };
      const got = e2.state(name, q.t0 + i * q.h), d = Math.hypot(got[0] - q.s[i * 6], got[1] - q.s[i * 6 + 1], got[2] - q.s[i * 6 + 2]);
      if (i % 2 === 1) worst = Math.max(worst, d / tolM);
    }
  }
  bench('FL-EPHEM-INTERP', 'Hermite interpolation of cached Horizons states at doubled node spacing', 'worst position error / 2 km (true error at stored spacing is ~16x smaller)', worst, 1, worst < 1, 'JPL Horizons DE441 nodes withheld from the interpolant');
  const t = tdbFromUtc('2027-01-04T00:00:00Z');
  const dm = norm(eph.rel('moon', 'earth', t)), ds = norm(eph.rel('sun', 'earth', t));
  assert.ok(dm > 3.56e8 && dm < 4.07e8); assert.ok(Math.abs(ds / AU - 0.9833) < 0.001);
});
test('time conversion round trip and invalid epoch', () => {
  const t = tdbFromUtc('2027-03-01T12:34:56Z'); assert.equal(utcFromTdb(t), '2027-03-01T12:34:56.000Z');
  assert.equal(tdbFromUtc('2000-01-01T12:00:00Z'), 69.184);
  assert.equal(codeOf(() => tdbFromUtc('yesterday')), 'invalid_epoch');
});
test('orbital elements round trip (elliptic, inclined) and circular/equatorial edge cases', () => {
  const el = { a: 1.2e7, e: 0.3, inc: 0.7, raan: 1.1, argp: 2.2, nu: 0.9 }, s = stateFromElements(el, BODIES.earth.mu), b = elements(s.r, s.v, BODIES.earth.mu);
  for (const k of Object.keys(el)) assert.ok(Math.abs(b[k] - el[k]) < 1e-9 * Math.max(1, Math.abs(el[k])), k);
  const c = elements([7e6, 0, 0], [0, Math.sqrt(BODIES.earth.mu / 7e6), 0], BODIES.earth.mu);
  assert.ok(c.e < 1e-12 && Number.isFinite(c.nu) && Number.isFinite(c.argp) && c.inc === 0);
});
test('Kepler orbit: energy, angular momentum and period are conserved by the propagator', () => {
  const P = 2 * Math.PI * Math.sqrt((BODIES.earth.radius + 300e3) ** 3 / BODIES.earth.mu);
  const r = runMission(base({ phases: [{ type: 'coast', until: { type: 'duration', s: 10 * P } }] }), eph), a = r.samples[0], b = r.samples.at(-1);
  const dE = Math.abs(b.energy / a.energy - 1), dh = Math.abs(b.h / a.h - 1), dr = norm(sub(b.r, a.r)) / norm(a.r);
  bench('FL-KEPLER', 'Two-body circular orbit propagated for 10 periods', 'max of relative energy drift, angular-momentum drift, position closure', Math.max(dE, dh, dr), 1e-6, Math.max(dE, dh, dr) < 1e-6, 'Analytic Kepler solution');
});
test('finite burn obeys the rocket equation and mass bookkeeping; burn stops at depletion', () => {
  const r = runMission(base({ phases: [{ type: 'burn', until: { type: 'dv', value_m_s: 3000 } }, { type: 'burn', until: { type: 'dv', value_m_s: 99999 } }, { type: 'burn', until: { type: 'duration', s: 10 } }] }), eph);
  const m0 = vehicleMass(veh()), ideal = 450 * G0 * Math.log(m0 / (m0 - 20000));
  bench('FL-ROCKET-EQ', 'Finite burn to depletion vs Tsiolkovsky equation', 'relative delta-v error', Math.abs(r.accounting.dv_thrust_m_s / ideal - 1), 1e-7, Math.abs(r.accounting.dv_thrust_m_s / ideal - 1) < 1e-7, 'Tsiolkovsky rocket equation');
  assert.equal(r.phases[0].outcome, 'condition'); assert.ok(Math.abs(r.phases[0].dv_thrust - 3000) < 1e-3);
  assert.equal(r.phases[1].outcome, 'depletion'); assert.match(r.phases[1].note, /cannot deliver/);
  assert.equal(r.phases[2].outcome, 'skipped_no_propellant');
  assert.ok(Math.abs(r.final.m - (m0 - 20000)) < 1e-6); assert.equal(r.accounting.propellant_remaining_kg[0], 0);
  assert.ok(r.samples.every(s => s.m > 0 && Number.isFinite(s.speed)));
});
test('staging: jettison removes dry mass, next stage burns, last stage cannot be dropped', () => {
  const r = runMission(base({ phases: [{ type: 'burn', until: { type: 'duration', s: 20 } }, { type: 'jettison' }, { type: 'burn', until: { type: 'depletion' } }] }), eph);
  assert.ok(Math.abs(r.phases[1].mass_end - 2500) < 1e-9); assert.ok(Math.abs(r.final.m - 1500) < 1e-6);
  assert.deepEqual(r.events.map(e => e.type), ['ignition', 'cutoff', 'stage', 'ignition', 'depletion']);
  assert.equal(codeOf(() => runMission(base({ phases: [{ type: 'jettison' }, { type: 'jettison' }] }), eph)), 'invalid_phase');
});
test('specific force: zero in coast, thrust/mass along body x in a burn', () => {
  const r = runMission(base({ phases: [{ type: 'coast', until: { type: 'duration', s: 100 } }, { type: 'burn', until: { type: 'duration', s: 10 } }] }), eph);
  const c = r.samples.find(s => s.phase === 0), b = r.samples.find(s => s.phase === 1);
  assert.deepEqual(c.specific_force_body, [0, 0, 0]);
  assert.ok(Math.abs(b.specific_force_body[0] - 100000 / b.m) < 1e-9 && Math.abs(b.specific_force_body[1]) < 1e-9);
});
test('event root finding: apoapsis/periapsis times of an eccentric orbit', () => {
  const m = base({ initial: { type: 'orbit', body: 'earth', periapsis_alt_m: 300e3, apoapsis_alt_m: 3000e3, inclination_deg: 10 }, phases: [{ type: 'coast', until: { type: 'apoapsis' } }, { type: 'coast', until: { type: 'periapsis' } }] });
  const r = runMission(m, eph), a = BODIES.earth.radius + 1650e3, P = 2 * Math.PI * Math.sqrt(a ** 3 / BODIES.earth.mu);
  assert.ok(Math.abs(r.phases[0].t_end - P / 2) < 1e-3); assert.ok(Math.abs(r.phases[1].t_end - P) < 1e-3);
});
test('impact ends the mission and is reported, not hidden', () => {
  const r = runMission(base({ initial: { type: 'orbit', body: 'earth', periapsis_alt_m: 150e3, inclination_deg: 0 }, phases: [{ type: 'burn', attitude: { mode: 'retrograde' }, until: { type: 'dv', value_m_s: 400 } }, { type: 'coast', until: { type: 'duration', s: 6000 } }] }), eph);
  assert.equal(r.ended, 'impact'); assert.equal(r.events.at(-1).type, 'impact');
});
test('drag lowers orbital energy; J2 regresses the node westward for a prograde orbit', () => {
  const lo = leoCoast({ altitude_m: 200e3, orbits: 3 }); lo.forces = { drag: true, j2: false, third_bodies: false };
  const r = runMission(lo, eph); assert.ok(r.samples.at(-1).energy < r.samples[0].energy); assert.ok(r.accounting.dv_drag_loss_m_s > 0);
  const j = leoCoast({ altitude_m: 500e3, orbits: 15, inclination_deg: 51.6 }); j.forces = { drag: false, j2: true, third_bodies: false };
  const q = runMission(j, eph), raan = s => Math.atan2(cross(s.r, s.v)[0], -cross(s.r, s.v)[1]);
  const rate = (raan(q.samples.at(-1)) - raan(q.samples[0])) / q.final.t;
  const a = BODIES.earth.radius + 500e3, n = Math.sqrt(BODIES.earth.mu / a ** 3), expected = -1.5 * n * BODIES.earth.j2 * (BODIES.earth.radius / a) ** 2 * Math.cos(51.6 * Math.PI / 180);
  bench('FL-J2-NODE', 'J2 nodal regression of a 500 km, 51.6 deg orbit', 'relative error vs first-order secular rate', Math.abs(rate / expected - 1), 0.02, Math.abs(rate / expected - 1) < 0.02, 'First-order secular J2 theory');
});
test('surface state co-rotates with the body; unsupported bodies and invalid states are rejected', () => {
  const t = tdbFromUtc('2026-11-20T00:00:00Z'), s = initialState({ type: 'surface', body: 'earth', latitude_deg: 28.6, longitude_deg: -80.6 }, eph, t);
  assert.ok(Math.abs(norm(s.r) - BODIES.earth.radius) < 1e-6);
  assert.ok(Math.abs(norm(s.v) - 7.2921159e-5 * BODIES.earth.radius * Math.cos(28.6 * Math.PI / 180)) < 0.5);
  const F = bodyFixedToInertial('mars', t); assert.ok(Math.abs(dot(F.x, F.z)) < 1e-12 && Math.abs(norm(F.x) - 1) < 1e-12);
  assert.equal(codeOf(() => initialState({ type: 'orbit', body: 'pluto', periapsis_alt_m: 1e5, inclination_deg: 0 }, eph, t)), 'unsupported_body');
  assert.equal(codeOf(() => initialState({ type: 'orbit', body: 'earth', periapsis_alt_m: -5, inclination_deg: 0 }, eph, t)), 'invalid_state');
  assert.equal(codeOf(() => initialState({ type: 'cartesian', body: 'earth', r_m: [1, 2, NaN], v_m_s: [0, 0, 0] }, eph, t)), 'invalid_state');
  assert.equal(codeOf(() => runMission(base({ vehicle: { payload_kg: -1, stages: [] }, phases: [] }), eph)), 'invalid_vehicle');
  assert.equal(codeOf(() => runMission(base({ epoch_utc: '1969-07-16T13:32:00Z', phases: [] }), eph)), 'ephemeris_range');
  assert.ok(density('earth', 0) > 1.2 && density('earth', 2e6) === 0 && density('mars', 0) < 0.03 && density(undefined, 0) === 0);
});
test('Lambert solver reproduces a propagated Kepler arc', () => {
  const mu = BODIES.sun.mu, s = stateFromElements({ a: 1.3 * AU, e: 0.2, inc: 0.05, raan: 0.3, argp: 1.0, nu: 0.2 }, mu);
  const r = runMission({ epoch_utc: '2027-01-01T00:00:00Z', centre: 'sun', vehicle: veh(), forces: { third_bodies: false }, initial: { type: 'cartesian', body: 'sun', r_m: s.r, v_m_s: s.v }, phases: [{ type: 'coast', until: { type: 'duration', s: 150 * DAY } }] }, eph);
  const L = lambert(s.r, r.final.r, 150 * DAY, mu), err = norm(sub(L.v1, s.v)) / norm(s.v);
  bench('FL-LAMBERT', 'Lambert solution vs numerically propagated heliocentric arc (150 d)', 'relative departure-velocity error', err, 1e-6, err < 1e-6, 'Self-consistency with the propagator');
  assert.equal(codeOf(() => lambert(s.r, r.final.r, -5, mu)), 'invalid_tof');
});
test('lunar transfer: planned with N-body propagation, reaches lunar orbit, mass ledger closes', () => {
  const { mission, plan } = planLunarTransfer(eph), r = runMission(mission, eph);
  assert.ok(plan.target_met); assert.equal(r.ended, 'end_of_plan'); assert.equal(r.final.centre, 'moon');
  assert.ok(r.final.ecc < 0.1 && r.final.periapsis_alt > 60e3 && r.final.apoapsis_alt < 450e3, JSON.stringify(r.final));
  const used = r.accounting.initial_mass_kg - r.final.m, dropped = VEHICLES.apollo_tli_stack.stages[0].dry_kg + r.phases[2].mass_start - r.phases[2].mass_end - VEHICLES.apollo_tli_stack.stages[0].dry_kg;
  assert.ok(r.phases.every(p => p.outcome !== 'max_duration' && p.outcome !== 'depletion'));
  assert.ok(used > 0 && dropped > 0 && r.final.t / DAY > 2.5 && r.final.t / DAY < 6);
  benchmarks.push({ id: 'FL-LUNAR', title: 'Lunar transfer scenario executed end to end', metric: 'final selenocentric orbit [periapsis km, apoapsis km, eccentricity]', value: [r.final.periapsis_alt / 1e3, r.final.apoapsis_alt / 1e3, r.final.ecc], tolerance: 'bound orbit, e < 0.1', status: 'PASS', reference: 'Scenario execution check (no external trajectory reference)', external: false });
});
test('Apollo-class stack cannot fly to Mars: insufficient propellant is reported', () => {
  assert.equal(codeOf(() => planEarthMars(eph, { vehicle: cloneVehicle('apollo_tli_stack') })), 'insufficient_propellant');
});
test('Earth-Mars bounded example reaches the Mars interface altitude near the planned arrival', () => {
  const { mission, plan } = planEarthMars(eph), r = runMission(mission, eph);
  assert.equal(r.final.centre, 'mars'); assert.ok(Math.abs(r.final.alt - 125e3) < 1);
  assert.ok(Math.abs(r.final.t / DAY - plan.tof_days) < 1.5); assert.ok(plan.c3_km2_s2 > 5 && plan.c3_km2_s2 < 40);
  assert.ok(plan.tcms.every(t => t.dv_m_s < 200), JSON.stringify(plan.tcms));
  const helio = r.samples.filter(s => s.centre === 'sun'); assert.ok(helio.length > 50 && helio.every(s => norm(s.r) > 0.9 * AU && norm(s.r) < 1.7 * AU));
  benchmarks.push({ id: 'FL-MARS', title: 'Earth-Mars bounded transfer executed end to end', metric: '[C3 km^2/s^2, arrival error days, total trim delta-v m/s]', value: [plan.c3_km2_s2, r.final.t / DAY - plan.tof_days, plan.tcms.reduce((a, t) => a + t.dv_m_s, 0)], tolerance: 'arrival at 125 km interface within 1.5 d of plan', status: 'PASS', reference: 'Scenario execution check (no external trajectory reference)', external: false });
});
test('determinism: identical inputs give identical outputs', () => {
  const a = runMission(leoCoast({ burn_dv_m_s: 50 }), eph), b = runMission(leoCoast({ burn_dv_m_s: 50 }), eph);
  assert.deepEqual(a.final, b.final); assert.equal(a.samples.length, b.samples.length);
});
test('6-DOF: torque-free angular momentum/energy conservation, spin-up matches analytic solution, off-axis thrust produces torque', () => {
  const I = [4000, 9000, 9000];
  const f = runSixDof({ mass_kg: 5000, inertia_kg_m2: I, duration_s: 300, omega0_body_rad_s: [0.3, 0.02, 0.01] }), a = f.samples[0], b = f.samples.at(-1);
  const drift = Math.max(Math.abs(b.L_mag / a.L_mag - 1), Math.abs(b.rot_energy_j / a.rot_energy_j - 1), norm(sub(b.L_inertial, a.L_inertial)) / a.L_mag);
  bench('FL-6DOF-FREE', 'Torque-free rigid body, 300 s', 'max relative drift of |L|, inertial L vector, rotational energy', drift, 1e-7, drift < 1e-7, 'Conservation laws');
  const s = runSixDof({ mass_kg: 5000, inertia_kg_m2: I, duration_s: 20, segments: [{ t0: 0, t1: 10, torque_body_n_m: [40, 0, 0] }] });
  assert.ok(Math.abs(s.samples.at(-1).omega_body[0] - 40 * 10 / 4000) < 1e-9);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(s.samples.at(-1).q[0])));
  assert.ok(Math.abs(ang - (0.5 * 0.01 * 100 + 0.1 * 10)) < 1e-7);
  const t = runSixDof({ mass_kg: 5000, inertia_kg_m2: I, duration_s: 5, thruster: { thrust_n: 1000, isp_s: 300, position_body_m: [-2, 0.5, 0], direction_body: [1, 0, 0] }, segments: [{ t0: 0, t1: 5, thrust: true }] });
  assert.ok(t.samples.at(-1).omega_body[2] < 0 && Math.abs(t.samples[1].specific_force_body[0] - 1000 / t.samples[1].m) < 1e-9);
  assert.ok(Math.abs(norm(qRotate([Math.SQRT1_2, 0, 0, Math.SQRT1_2], [1, 0, 0])) - 1) < 1e-12);
  assert.equal(codeOf(() => runSixDof({ mass_kg: 1, inertia_kg_m2: [1, 0, 1], duration_s: 1 })), 'invalid_vehicle');
});
test('flight excerpt for coupling and CSV export', () => {
  const r = runMission(leoCoast({ burn_dv_m_s: 30 }), eph), x = toExcerpt(r, { vehicle: 'orbital_lab', mission: 'leo', run_id: 'flt_test' });
  assert.equal(x.samples.length, r.samples.length); assert.ok(x.samples.every(s => s.specific_force_body.length === 3 && Number.isFinite(s.t)));
  assert.ok(x.samples.every((s, i) => i === 0 || s.t > x.samples[i - 1].t));
  const csv = flightCsv(r); assert.ok(csv.split('\n').length === r.samples.length + 1 && csv.startsWith('t_s,'));
  const L = toExcerpt(runSaturnLegacy(), { vehicle: 'saturn_v', mission: 'legacy', run_id: 'x' });
  assert.ok(L.samples.length > 100 && L.events.some(e => /S-IC|stage|cutoff/i.test(e.name)));
});
test.after(() => { if (process.env.SOLARIS_FLIGHT_BENCH_OUT) fs.writeFileSync(process.env.SOLARIS_FLIGHT_BENCH_OUT, JSON.stringify({ generated_utc: new Date().toISOString(), node: process.version, benchmarks }, null, 1)); });
