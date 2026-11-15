/** Export helpers: coupling excerpt (flight -> chamber) and CSV telemetry. */
const hashString = s => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0'); };

/** Strictly increasing samples (duplicates at phase boundaries: keep the later state, offset by 1 microsecond). */
export function toExcerpt(result, { vehicle, mission, run_id, input = null }) {
  const samples = []; let last = -Infinity;
  for (const s of result.samples) {
    let t = s.t; if (t <= last) t = last + 1e-6; last = t;
    samples.push({ t, specific_force_body: s.specific_force_body.map(v => v || 0), omega_body: s.omega_body ?? [0, 0, 0], alpha_body: s.alpha_body ?? [0, 0, 0] });
  }
  const tele = k => result.samples.map(s => Number.isFinite(s[k]) ? s[k] : 0);
  return { flight_run_id: run_id, vehicle, mission, model: result.model, time_scale: result.frames?.time ?? 'seconds from start', body_frame: result.frames?.body ?? 'x = thrust axis',
    input_hash: hashString(JSON.stringify(input ?? {})), samples, events: result.events.map(e => ({ t: e.t, name: (e.text ?? e.type).slice(0, 200) })),
    telemetry: { t: samples.map(s => s.t), altitude_m: tele('alt'), speed_m_s: tele('speed'), mass_kg: tele('m') } };
}
const COLS = [['t_s', s => s.t], ['centre', s => s.centre ?? ''], ['x_m', s => s.r[0]], ['y_m', s => s.r[1]], ['z_m', s => s.r[2]], ['vx_m_s', s => s.v[0]], ['vy_m_s', s => s.v[1]], ['vz_m_s', s => s.v[2]],
  ['mass_kg', s => s.m], ['altitude_m', s => s.alt], ['speed_m_s', s => s.speed], ['stage', s => s.stage ?? ''], ['burning', s => s.burning ? 1 : 0],
  ['specific_force_bx_m_s2', s => s.specific_force_body[0]], ['specific_force_by_m_s2', s => s.specific_force_body[1]], ['specific_force_bz_m_s2', s => s.specific_force_body[2]],
  ['periapsis_alt_m', s => s.periapsis_alt ?? ''], ['apoapsis_alt_m', s => s.apoapsis_alt ?? ''], ['eccentricity', s => s.ecc ?? ''], ['inclination_deg', s => s.inc_deg ?? '']];
export const flightCsv = result => [COLS.map(c => c[0]).join(','), ...result.samples.map(s => COLS.map(c => { const v = c[1](s); return typeof v === 'number' && !Number.isFinite(v) ? '' : v; }).join(','))].join('\n');
export { hashString };
