/** 6-DOF rigid-body demonstrator (hypothetical vehicle only): two-body gravity about one centre, body-fixed thrust with
 *  lever arm, commanded body torques, constant principal inertia. State: r, v, quaternion (body->inertial, scalar first), omega_body, mass.
 *  Not modelled: aerodynamic moments, slosh, flexible modes, inertia change with propellant use, gravity-gradient torque. */
import { BODIES, G0, FlightError, add, sub, mul, dot, cross, norm, dp5Step, tdbFromUtc } from './core.js';

export const qRotate = (q, v) => { const [w, x, y, z] = q, u = [x, y, z], t = mul(cross(u, v), 2); return add(add(v, mul(t, w)), cross(u, t)); };
export const qConjRotate = (q, v) => qRotate([q[0], -q[1], -q[2], -q[3]], v);

export function runSixDof(spec) {
  const b = BODIES[spec.centre ?? 'earth'];
  const I = spec.inertia_kg_m2;
  if (!b) throw new FlightError('unsupported_body', 'Unsupported centre.', 'centre');
  if (!Array.isArray(I) || I.length !== 3 || !I.every(v => Number.isFinite(v) && v > 0)) throw new FlightError('invalid_vehicle', 'Principal inertias must be three positive numbers.', 'inertia_kg_m2');
  if (!(spec.mass_kg > 0 && spec.duration_s > 0 && spec.duration_s <= 86400)) throw new FlightError('invalid_spec', 'Mass must be > 0 and duration in (0, 86400] s.', 'duration_s');
  const rp = b.radius + (spec.altitude_m ?? 400e3), vc = Math.sqrt(b.mu / rp);
  const segs = (spec.segments ?? []).slice().sort((a, c) => a.t0 - c.t0);
  const active = t => segs.filter(s => t >= s.t0 && t < s.t1);
  const thr = spec.thruster ?? { thrust_n: 0, isp_s: 300, position_body_m: [-2, 0, 0], direction_body: [1, 0, 0] };
  const f = (t, y) => {
    const r = y.slice(0, 3), q = y.slice(6, 10), w = y.slice(10, 13), m = y[13], R = norm(r);
    let Fb = [0, 0, 0], Tb = [0, 0, 0], mdot = 0;
    for (const s of active(t)) {
      if (s.torque_body_n_m) Tb = add(Tb, s.torque_body_n_m);
      if (s.thrust) { const F = mul(thr.direction_body, thr.thrust_n); Fb = add(Fb, F); Tb = add(Tb, cross(thr.position_body_m, F)); mdot += thr.thrust_n / (thr.isp_s * G0); }
    }
    const a = add(mul(r, -b.mu / R ** 3), mul(qRotate(q, Fb), 1 / m));
    const Iw = [I[0] * w[0], I[1] * w[1], I[2] * w[2]], wd = sub(Tb, cross(w, Iw)).map((v, i) => v / I[i]);
    const [q0, q1, q2, q3] = q;
    const qd = [0.5 * (-q1 * w[0] - q2 * w[1] - q3 * w[2]), 0.5 * (q0 * w[0] + q2 * w[2] - q3 * w[1]), 0.5 * (q0 * w[1] - q1 * w[2] + q3 * w[0]), 0.5 * (q0 * w[2] + q1 * w[1] - q2 * w[0])];
    return [y[3], y[4], y[5], ...a, ...qd, ...wd, -mdot];
  };
  let y = [rp, 0, 0, 0, vc, 0, 1, 0, 0, 0, ...(spec.omega0_body_rad_s ?? [0, 0, 0]), spec.mass_kg], t = 0;
  const tol = { rel: 1e-10, abs: [1e-3, 1e-3, 1e-3, 1e-6, 1e-6, 1e-6, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-10, 1e-6] };
  const breaks = [...new Set([0, spec.duration_s, ...segs.flatMap(s => [s.t0, s.t1])])].filter(v => v >= 0 && v <= spec.duration_s).sort((a, c) => a - c);
  const dtOut = spec.output_dt_s ?? spec.duration_s / 400, samples = [];
  const rec = (tt, yy, tEval) => {
    const q = yy.slice(6, 10), w = yy.slice(10, 13), d = f(tEval ?? tt, yy), m = yy[13];
    let Fb = [0, 0, 0]; for (const s of active(tEval ?? tt)) if (s.thrust) Fb = add(Fb, mul(thr.direction_body, thr.thrust_n));
    const Li = qRotate(q, [I[0] * w[0], I[1] * w[1], I[2] * w[2]]);
    samples.push({ t: tt, r: yy.slice(0, 3), v: yy.slice(3, 6), q, omega_body: w, alpha_body: d.slice(10, 13), m, specific_force_body: mul(Fb, 1 / m), alt: norm(yy) - b.radius, speed: norm(yy.slice(3, 6)),
      body_x: qRotate(q, [1, 0, 0]), L_inertial: Li, L_mag: norm(Li), rot_energy_j: 0.5 * (I[0] * w[0] ** 2 + I[1] * w[1] ** 2 + I[2] * w[2] ** 2), q_norm_error: Math.hypot(...q) - 1, burning: norm(Fb) > 0 });
  };
  let steps = 0;
  for (let k = 0; k < breaks.length - 1; k++) {
    const tEnd = breaks[k + 1], mid = 0.5 * (breaks[k] + tEnd); let h = Math.min(0.05, tEnd - t), fy = f(mid, y), next = t;
    const fs = (tt, yy) => f(mid, yy);   // forcing is piecewise constant: evaluate segment activity at the interval midpoint
    rec(t, y, mid);
    while (t < tEnd - 1e-12) {
      h = Math.min(h, tEnd - t);
      const st = dp5Step(fs, t, y, h, fy, tol); steps++;
      while (next + dtOut < st.t - 1e-12) { next += dtOut; rec(next, st.dense(next), mid); }
      t = st.t; y = st.y; const qn = Math.hypot(...y.slice(6, 10)); for (let i = 6; i < 10; i++) y[i] /= qn;
      fy = fs(t, y); h = st.hNext;
    }
    rec(t, y, mid);
  }
  return { status: 'completed', engine: 'solaris-sixdof-1.0', model: '6-DOF rigid body (quaternion attitude, Euler equations, constant principal inertia) in two-body gravity; adaptive Dormand-Prince 5(4)',
    assumptions: ['Hypothetical vehicle', 'Constant inertia tensor (propellant use does not change it)', 'No aerodynamic, gravity-gradient, slosh or flexible-body torques', 'Thrust and torque commands are piecewise constant'],
    samples, events: segs.flatMap(s => [{ t: s.t0, type: s.thrust ? 'ignition' : 'torque_on', text: s.label ?? (s.thrust ? 'Thruster on' : 'Torque on') }, { t: s.t1, type: s.thrust ? 'cutoff' : 'torque_off', text: (s.label ?? '') + ' end' }]).sort((a, c) => a.t - c.t),
    frames: { axes: 'inertial, centred on ' + b.name, body: 'principal axes; quaternion maps body to inertial', time: 'seconds from start' }, numerics: { steps, rel_tol: 1e-10 } };
}
