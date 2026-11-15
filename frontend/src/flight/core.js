/** SOLARIS 5.0 flight engine core: vectors, constants, time, ephemeris, integrator, two-body tools.
 *  SI units throughout. Inertial axes: ICRF. Time: TDB seconds past J2000.0. */
export const G0 = 9.80665;
export const AU = 149597870700;
export const DAY = 86400;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = a => Math.hypot(a[0], a[1], a[2]);
export const unit = a => { const n = norm(a); if (!(n > 0)) throw new FlightError('zero_vector', 'Cannot normalise a zero vector.'); return mul(a, 1 / n); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const D2R = Math.PI / 180;

export class FlightError extends Error {
  constructor(code, message, field = null, recovery = null) { super(message); this.code = code; this.field = field; this.recovery = recovery; }
}

/** GM values: JPL DE440/DE441 (Park et al. 2021, AJ 161:105), m^3/s^2. Planet-system GM for bodies given at barycentres. */
export const BODIES = {
  sun:     { name: 'Sun',     mu: 1.32712440041279419e20, radius: 6.957e8 },
  mercury: { name: 'Mercury', mu: 2.2031868551e13, radius: 2.4397e6, soi: 1.12e8 },
  venus:   { name: 'Venus',   mu: 3.24858592e14,   radius: 6.0518e6, soi: 6.16e8 },
  earth:   { name: 'Earth',   mu: 3.98600435507e14, radius: 6.3781366e6, j2: 1.0826359e-3, soi: 9.25e8,
             rotation: { ra: 0, dec: 90, w0: 280.46061837, rate: 360.98564736629 }, atmosphere: 'earth' },
  moon:    { name: 'Moon',    mu: 4.902800118e12,  radius: 1.7374e6, soi: 6.61e7,
             rotation: { ra: 269.9949, dec: 66.5392, w0: 38.3213, rate: 13.17635815 } },
  mars:    { name: 'Mars',    mu: 4.2828375816e13, radius: 3.3962e6, soi: 5.77e8,
             rotation: { ra: 317.681, dec: 52.887, w0: 176.630, rate: 350.89198226 }, atmosphere: 'mars' },
  jupiter: { name: 'Jupiter system', mu: 1.26712764100e17, radius: 7.1492e7, soi: 4.82e10 },
  saturn:  { name: 'Saturn system',  mu: 3.79405848418e16, radius: 6.0268e7, soi: 5.46e10 },
  uranus:  { name: 'Uranus system',  mu: 5.794556400e15,   radius: 2.5559e7, soi: 5.18e10 },
  neptune: { name: 'Neptune system', mu: 6.83652710058e15, radius: 2.4764e7, soi: 8.66e10 },
};
export const SUPPORTED_CENTRES = ['earth', 'moon', 'mars', 'sun'];

/* ---------------------------------------------------------------- time */
export const TT_MINUS_UTC = 69.184;   // 37 leap seconds + 32.184 s; valid from 2017-01-01 until a new leap second is announced
export function tdbFromUtc(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new FlightError('invalid_epoch', `Epoch "${iso}" is not a valid ISO-8601 UTC time.`, 'epoch_utc');
  return (ms - Date.UTC(2000, 0, 1, 12, 0, 0)) / 1000 + TT_MINUS_UTC;   // TDB ~ TT (difference < 2 ms neglected)
}
export const utcFromTdb = t => new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + (t - TT_MINUS_UTC) * 1000).toISOString();

/* ---------------------------------------------------------------- ephemeris */
export class Ephemeris {
  constructor(table) {
    if (table?.format !== 'solaris-ephemeris-1') throw new FlightError('ephemeris_format', 'Unrecognised ephemeris table.');
    this.meta = { source: table.source, retrieved_utc: table.retrieved_utc, center: table.center, frame: table.frame, time_scale: table.time_scale, start: table.start, stop: table.stop, interpolation: table.interpolation };
    this.b = {};
    for (const [k, v] of Object.entries(table.bodies)) this.b[k] = { t0: v.t0, h: v.step_s, n: v.n, s: Float64Array.from(v.states), source: v.horizons_source, id: v.horizons_id };
    this.tMin = Math.max(...Object.values(this.b).map(q => q.t0));
    this.tMax = Math.min(...Object.values(this.b).map(q => q.t0 + (q.n - 1) * q.h));
  }
  /** Barycentric state [x,y,z,vx,vy,vz] by cubic Hermite interpolation. Never extrapolates. */
  state(body, t, out = new Array(6)) {
    const q = this.b[body];
    if (!q) throw new FlightError('unsupported_body', `Body "${body}" is not in the ephemeris.`, 'body');
    const x = (t - q.t0) / q.h;
    if (!(x >= 0 && x <= q.n - 1)) throw new FlightError('ephemeris_range', `Time ${Number.isFinite(t) ? utcFromTdb(t) : t} is outside the cached ephemeris (${this.meta.start} to ${this.meta.stop}). No extrapolation is performed.`, 'epoch_utc', 'Choose an epoch inside the cached interval or regenerate the cache with tools/fetch_ephemeris.py.');
    const i = Math.min(Math.floor(x), q.n - 2), s = x - i, h = q.h, a = i * 6, b = a + 6, S = q.s;
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const d00 = (6 * s2 - 6 * s) / h, d10 = 3 * s2 - 4 * s + 1, d01 = -d00, d11 = 3 * s2 - 2 * s;
    for (let k = 0; k < 3; k++) {
      out[k] = h00 * S[a + k] + h10 * h * S[a + 3 + k] + h01 * S[b + k] + h11 * h * S[b + 3 + k];
      out[k + 3] = d00 * S[a + k] + d10 * S[a + 3 + k] + d01 * S[b + k] + d11 * S[b + 3 + k];
    }
    return out;
  }
  /** State of `body` relative to `centre` (ICRF axes). */
  rel(body, centre, t) {
    const a = this.state(body, t), c = this.state(centre, t);
    return [a[0] - c[0], a[1] - c[1], a[2] - c[2], a[3] - c[3], a[4] - c[4], a[5] - c[5]];
  }
}

/* ---------------------------------------------------------------- body-fixed frames */
/** Rotation matrix columns: body-fixed -> ICRF, IAU-style (pole RA/Dec, prime meridian W). Approximation: constant pole, mean rotation; no precession/nutation/libration. */
export function bodyFixedToInertial(body, t) {
  const R = BODIES[body]?.rotation;
  if (!R) throw new FlightError('no_rotation_model', `No rotation model for ${body}.`, 'body');
  const d = (t - TT_MINUS_UTC) / DAY;
  const a = R.ra * D2R, de = R.dec * D2R, W = ((R.w0 + R.rate * d) % 360) * D2R;
  const z = [Math.cos(de) * Math.cos(a), Math.cos(de) * Math.sin(a), Math.sin(de)];
  const node = R.dec === 90 ? [1, 0, 0] : unit(cross([0, 0, 1], z));         // ascending node of body equator on ICRF equator
  const m = cross(z, node);
  const x = add(mul(node, Math.cos(W)), mul(m, Math.sin(W))), y = cross(z, x);
  return { x, y, z, omega: mul(z, R.rate * D2R / DAY) };
}

/* ---------------------------------------------------------------- atmospheres (flight drag only) */
const EARTH_ATM = [[0, 1.225, 7.249], [25, 3.899e-2, 6.349], [30, 1.774e-2, 6.682], [40, 3.972e-3, 7.554], [50, 1.057e-3, 8.382], [60, 3.206e-4, 7.714], [70, 8.770e-5, 6.549],
  [80, 1.905e-5, 5.799], [90, 3.396e-6, 5.382], [100, 5.297e-7, 5.877], [110, 9.661e-8, 7.263], [120, 2.438e-8, 9.473], [130, 8.484e-9, 12.636], [140, 3.845e-9, 16.149],
  [150, 2.070e-9, 22.523], [180, 5.464e-10, 29.740], [200, 2.789e-10, 37.105], [250, 7.248e-11, 45.546], [300, 2.418e-11, 53.628], [350, 9.518e-12, 53.298], [400, 3.725e-12, 58.515],
  [450, 1.585e-12, 60.828], [500, 6.967e-13, 63.822], [600, 1.454e-13, 71.835], [700, 3.614e-14, 88.667], [800, 1.170e-14, 124.64], [900, 5.245e-15, 181.05], [1000, 3.019e-15, 268.00]];
/** Density [kg/m^3]. Earth: exponential band model (Vallado, Fundamentals of Astrodynamics, Table 8-4). Mars: single exponential (approximation). */
export function density(model, alt) {
  if (model === 'earth') {
    if (alt > 1.5e6) return 0;
    const km = Math.max(0, alt / 1000);
    let i = EARTH_ATM.length - 1; while (i > 0 && km < EARTH_ATM[i][0]) i--;
    return EARTH_ATM[i][1] * Math.exp(-(km - EARTH_ATM[i][0]) / EARTH_ATM[i][2]);
  }
  if (model === 'mars') return alt > 3e5 ? 0 : 0.020 * Math.exp(-Math.max(0, alt) / 11100);
  return 0;
}

/* ---------------------------------------------------------------- Dormand-Prince 5(4) with dense output */
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
const Dn = [-12715105075 / 11282082432, 0, 87487479700 / 32700410799, -10690763975 / 1880347072, 701980252875 / 199316789632, -1453857185 / 822651844, 69997945 / 29380423];

/** One adaptive step. Returns {t, y, h, hNext, dense(tq), fNew} or throws on step-size underflow. scale(y) gives per-component error scales. */
export function dp5Step(f, t, y, h, fy, tol) {
  const n = y.length, k = [fy];
  for (let attempt = 0; attempt < 60; attempt++) {
    for (let s = 1; s < 7; s++) {
      const ys = new Array(n);
      for (let i = 0; i < n; i++) { let acc = 0; for (let j = 0; j < s; j++) acc += A[s][j] * k[j][i]; ys[i] = y[i] + h * acc; }
      k[s] = f(t + C[s] * h, ys);
      if (s === 6) k.y1 = ys;
    }
    const y1 = k.y1; let err = 0;
    for (let i = 0; i < n; i++) {
      let e = 0; for (let j = 0; j < 7; j++) e += E[j] * k[j][i];
      const sc = tol.abs[i] + tol.rel * Math.max(Math.abs(y[i]), Math.abs(y1[i]));
      err = Math.max(err, Math.abs(h * e) / sc);
    }
    if (!Number.isFinite(err)) { h *= 0.2; if (Math.abs(h) < 1e-9) break; continue; }
    if (err <= 1) {
      const fac = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(err, -0.2)));
      const kk = k.slice(0, 7), y0 = y, hh = h;
      const dense = tq => {
        const th = (tq - t) / hh, th1 = 1 - th, out = new Array(n);
        for (let i = 0; i < n; i++) {
          const dy = y1[i] - y0[i], b = hh * kk[0][i] - dy, c = dy - hh * kk[6][i] - b;
          let d = 0; for (let j = 0; j < 7; j++) d += Dn[j] * kk[j][i];
          out[i] = y0[i] + th * (dy + th1 * (b + th * (c + th1 * hh * d)));
        }
        return out;
      };
      return { t: t + h, y: y1, h, hNext: h * fac, dense, fNew: k[6] };
    }
    h *= Math.max(0.2, 0.9 * Math.pow(err, -0.2));
    if (Math.abs(h) < 1e-9) break;
  }
  throw new FlightError('integration_failed', `Adaptive integrator step size underflow at t = ${t} s; the trajectory is invalid.`);
}

/* ---------------------------------------------------------------- two-body tools */
export function elements(r, v, mu) {
  const R = norm(r), v2 = dot(v, v), h = cross(r, v), hm = norm(h);
  const energy = v2 / 2 - mu / R;
  const ev = sub(mul(cross(v, h), 1 / mu), mul(r, 1 / R)), e = norm(ev);
  const a = Math.abs(energy) < 1e-12 ? Infinity : -mu / (2 * energy);
  const inc = Math.acos(clamp(h[2] / hm, -1, 1));
  const nvec = [-h[1], h[0], 0], nm = norm(nvec);
  let raan = nm > 1e-12 * hm ? Math.atan2(nvec[1], nvec[0]) : 0; if (raan < 0) raan += 2 * Math.PI;
  let argp = 0, nu;
  if (e > 1e-10) {
    if (nm > 1e-12 * hm) { argp = Math.acos(clamp(dot(nvec, ev) / (nm * e), -1, 1)); if (ev[2] < 0) argp = 2 * Math.PI - argp; }
    else argp = Math.atan2(ev[1], ev[0]);
    nu = Math.acos(clamp(dot(ev, r) / (e * R), -1, 1)); if (dot(r, v) < 0) nu = 2 * Math.PI - nu;
  } else {
    const ref = nm > 1e-12 * hm ? mul(nvec, 1 / nm) : [1, 0, 0];
    nu = Math.atan2(dot(cross(ref, r), mul(h, 1 / hm)), dot(ref, r)); if (nu < 0) nu += 2 * Math.PI;
  }
  const p = hm * hm / mu;
  return { a, e, inc, raan, argp, nu, energy, h: hm, p, rp: p / (1 + e), ra: e < 1 ? p / (1 - e) : Infinity, period: e < 1 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : Infinity, c3: 2 * energy };
}
export function stateFromElements({ a, e, inc, raan, argp, nu }, mu) {
  const p = a * (1 - e * e), r = p / (1 + e * Math.cos(nu));
  const rp = [r * Math.cos(nu), r * Math.sin(nu), 0], k = Math.sqrt(mu / p), vp = [-k * Math.sin(nu), k * (e + Math.cos(nu)), 0];
  const cO = Math.cos(raan), sO = Math.sin(raan), ci = Math.cos(inc), si = Math.sin(inc), cw = Math.cos(argp), sw = Math.sin(argp);
  const rot = q => [(cO * cw - sO * sw * ci) * q[0] + (-cO * sw - sO * cw * ci) * q[1], (sO * cw + cO * sw * ci) * q[0] + (-sO * sw + cO * cw * ci) * q[1], sw * si * q[0] + cw * si * q[1]];
  return { r: rot(rp), v: rot(vp) };
}

const stumpC = z => z > 1e-6 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-6 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24;
const stumpS = z => { if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); } if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); } return 1 / 6 - z / 120; };
/** Single-revolution Lambert problem (universal variables, bisection on z). Returns {v1, v2}. */
export function lambert(r1, r2, tof, mu, prograde = true) {
  if (!(tof > 0)) throw new FlightError('invalid_tof', 'Lambert time of flight must be positive.', 'tof');
  const R1 = norm(r1), R2 = norm(r2), cz = cross(r1, r2)[2];
  let dnu = Math.acos(clamp(dot(r1, r2) / (R1 * R2), -1, 1));
  if ((prograde && cz < 0) || (!prograde && cz >= 0)) dnu = 2 * Math.PI - dnu;
  const Aq = Math.sin(dnu) * Math.sqrt(R1 * R2 / (1 - Math.cos(dnu)));
  if (!(Math.abs(Aq) > 0)) throw new FlightError('lambert_singular', 'Lambert geometry is singular (transfer angle 0 or 180 deg).');
  const yz = z => R1 + R2 + Aq * (z * stumpS(z) - 1) / Math.sqrt(stumpC(z));
  const F = z => { const y = yz(z); if (!(y > 0)) return -Infinity; return Math.pow(y / stumpC(z), 1.5) * stumpS(z) + Aq * Math.sqrt(y) - Math.sqrt(mu) * tof; };
  const zTop = 4 * Math.PI * Math.PI - 1e-9;
  let lo = null, hi = zTop;   // scan downward from the single-revolution limit for the first sign change
  if (!(F(hi) > 0)) throw new FlightError('lambert_no_solution', 'No single-revolution Lambert solution for this geometry and time of flight.');
  for (let z = zTop - 0.25; z > -400; z -= z > -40 ? 0.25 : 4) { if (F(z) < 0) { lo = z; break; } hi = z; }
  if (lo === null) throw new FlightError('lambert_no_solution', 'No single-revolution Lambert solution for this geometry and time of flight.');
  for (let i = 0; i < 200; i++) { const m = 0.5 * (lo + hi); if (F(m) > 0) hi = m; else lo = m; if (hi - lo < 1e-13 * Math.max(1, Math.abs(m))) break; }
  const z = 0.5 * (lo + hi), y = yz(z), f = 1 - y / R1, g = Aq * Math.sqrt(y / mu), gd = 1 - y / R2;
  return { v1: mul(sub(r2, mul(r1, f)), 1 / g), v2: mul(sub(mul(r2, gd), r1), 1 / g) };
}
