/**
 * Merge integration tests: SOLARIS 5.0 capabilities are reachable through the live SOLARIS
 * route registry and navigation, and the live routes are all still present.
 * Adapted from SOLARIS 5.0 tests/v5-integration.test.mjs to the live code structure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { Ephemeris } from '../src/flight/core.js';
import { SCENARIOS, DEFAULTS, runFlight } from '../src/flight/runner.js';
import { toExcerpt } from '../src/flight/exports.js';
import { queryParts, restoreView, togglePin } from '../src/features/data-atlas/workspace.js';

const src = new URL('../src/', import.meta.url), root = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, src), 'utf-8');
const eph = new Ephemeris(JSON.parse(readFileSync(new URL('../public/ephemeris/de441_2026_2032.json', import.meta.url), 'utf-8')));
const scenarios = readdirSync(new URL('scenarios/', root)).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(new URL('scenarios/' + f, root), 'utf-8')));

test('every live route is preserved and the new destinations are registered with page files', () => {
  const routes = read('routes.js');
  for (const live of ['/', '/discover', '/lab', '/timeline', '/habitat', '/explore', '/research', '/theater', '/universe', '/report', '/copilot', '/library', '/about'])
    assert.ok(routes.includes(`path: '${live}'`), `live route ${live} kept`);
  for (const [route, file] of [['/world', 'World'], ['/flame', 'Flame'], ['/flight', 'Flight'], ['/onboard', 'Onboard'], ['/scenarios', 'Scenarios'], ['/methods', 'Methods']]) {
    assert.ok(routes.includes(`path: '${route}', file: '${file}'`), `route ${route}`);
    assert.ok(existsSync(new URL(`pages/${file}.jsx`, src)), `page ${file}.jsx`);
    assert.match(routes, new RegExp(`path: '${route}'[^\\n]*group: 'simulate'`), `${route} in Simulate group`);
  }
});

test('Simulate group is in the header; home, report, studio, atlas and library expose the merged features', () => {
  assert.match(read('components/SiteHeader.jsx'), /id: 'simulate'/);
  const home = read('components/ExperienceGrid.jsx');
  for (const r of ['#/world', '#/flame', '#/flight', '#/onboard']) assert.ok(home.includes(r), `home ${r}`);
  assert.match(read('pages/Report.jsx'), /RunLedger/);
  assert.match(read('pages/Research.jsx'), /referee: RefereeTool/);
  assert.match(read('pages/Explore.jsx'), /SourceTables/);
  assert.match(read('pages/Habitat.jsx'), /TracerSandbox/);
  assert.match(read('pages/Library.jsx'), /view=tables/);
  assert.ok(existsSync(new URL('features/cosmic-flame-v2/index.jsx', src)), 'teammate lab installed at the integration point');
});

test('simulation and flight code is bundled: no iframes and no remote code or data', () => {
  const files = [...readdirSync(new URL('features/sim/', src)).filter(f => /\.jsx?$/.test(f)).map(f => 'features/sim/' + f),
    ...readdirSync(new URL('flight/', src)).filter(f => f.endsWith('.js')).map(f => 'flight/' + f),
    ...['World', 'Flame', 'Flight', 'Onboard', 'Scenarios', 'Methods'].map(f => `pages/${f}.jsx`)];
  for (const f of files) {
    const t = read(f);
    assert.ok(!/<iframe/i.test(t), `${f}: iframe`);
    assert.ok(!/(import|src=|fetch\()\s*\(?['"`]https?:\/\//.test(t), `${f}: remote load`);
    assert.ok(!/unpkg|jsdelivr|cdnjs/.test(t), `${f}: CDN`);
  }
  assert.match(read('flight/runner.js'), /legacy/);
});

test('simulated outputs are labelled as such on every simulation page', () => {
  for (const f of ['World', 'Flame', 'Flight', 'Onboard']) assert.match(read(`pages/${f}.jsx`), /SimulatedBadge/, f);
  assert.match(read('features/sim/ui.jsx'), /not a NASA measurement/);
  assert.match(read('styles/system.css'), /--ev-simulation/);
});

test('every flight scenario has defaults, honest labels and runs', () => {
  assert.deepEqual(SCENARIOS.map(s => s.id), ['saturn_legacy', 'leo', 'lunar', 'mars', 'free', 'sixdof']);
  for (const s of SCENARIOS) { assert.ok(DEFAULTS[s.id], s.id); assert.ok(s.limits.length > 20); assert.match(s.dof, /3-DOF|6-DOF/); }
  for (const id of ['saturn_legacy', 'leo', 'sixdof']) {
    const o = runFlight(id, id === 'leo' ? { orbits: 1 } : {}, eph);
    assert.ok(o.result.samples.length > 10 && o.result.views.length >= 1 && o.vehicle.name, id);
    const x = toExcerpt(o.result, { vehicle: o.vehicle.name, mission: o.meta.name, run_id: 't' });
    assert.ok(x.samples.length > 10 && x.samples.every(q => q.specific_force_body.length === 3) && x.telemetry.t.length === x.samples.length, `${id} excerpt`);
  }
  assert.throws(() => runFlight('leo', { epoch_utc: '2040-01-01T00:00:00Z' }, eph), e => e.code === 'ephemeris_range');
});

test('twelve bundled scenarios are well formed and only link to live routes', () => {
  assert.equal(scenarios.length, 12);
  const routes = read('routes.js');
  for (const s of scenarios) {
    for (const k of ['title', 'destination', 'summary', 'expected_behaviour', 'expected_runtime', 'payload']) assert.ok(s[k], `${s.title}: ${k}`);
    if (s.destination === 'guide') for (const st of s.payload.steps) assert.ok(routes.includes(`path: '${st.route.split('?')[0]}'`), `${s.title}: ${st.route}`);
    if (s.destination === 'flight') assert.ok(SCENARIOS.some(x => x.id === s.payload.scenario), s.title);
  }
});

test('source-table view state: only valid pins/rules restored; query parts match the API contract', () => {
  const store = { getItem: () => JSON.stringify({ search: 'PMMA', rules: [{ field: 'Material', op: 'eq', value: 'PMMA' }, { field: 1, op: 'eq' }], pins: ['spice-table:row:3', 'flex-table:row:1', 'spice-table:row:x'], field: 'Fuel' }) };
  const v = restoreView('spice-table', store);
  assert.deepEqual(v.pins, ['spice-table:row:3']);
  assert.equal(v.rules.length, 1);
  assert.deepEqual(queryParts(v), { search: 'PMMA', filters: [{ field: 'Material', op: 'eq', value: 'PMMA' }] });
  assert.deepEqual(togglePin(['a'], 'a'), []);
});
