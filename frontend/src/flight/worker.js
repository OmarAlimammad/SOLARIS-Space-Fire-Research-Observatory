/** Flight Laboratory worker: keeps trajectory integration off the UI thread. */
import { Ephemeris } from './core.js';
import { runFlight } from './runner.js';
let eph = null;
self.onmessage = async ({ data }) => {
  const { id, scenario, params, ephemerisUrl, needsEphemeris } = data;
  try {
    if (needsEphemeris && !eph) { const r = await fetch(ephemerisUrl); if (!r.ok) throw Object.assign(new Error(`Ephemeris cache could not be loaded (${r.status}).`), { code: 'ephemeris_missing', recovery: 'Check that the file public/ephemeris/de441_2026_2032.json is present, then retry.' }); eph = new Ephemeris(await r.json()); }
    const t0 = performance.now(), out = runFlight(scenario, params, eph);
    out.wall_ms = performance.now() - t0;
    self.postMessage({ id, ok: true, out });
  } catch (e) { self.postMessage({ id, ok: false, error: { code: e.code ?? 'flight_error', message: e.message, field: e.field ?? null, recovery: e.recovery ?? null } }); }
};
