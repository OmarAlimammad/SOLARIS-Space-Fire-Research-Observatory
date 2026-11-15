import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse, buoyantVelocityCmS, gravityAtAltitude, ENVIRONMENTS, o2PartialPressureKPa } from '../src/scientific/flamePhysics.js';

test('buoyant velocity scale follows sqrt(g L dT/T)', () => {
  assert.ok(Math.abs(buoyantVelocityCmS(9.80665) - 62.6) < 0.2);
  assert.ok(buoyantVelocityCmS(1.62) < buoyantVelocityCmS(3.71));
  assert.ok(buoyantVelocityCmS(ENVIRONMENTS.iss.gEff) < 0.1);
});
test('gravity does not vanish at ISS altitude; free fall is what removes buoyancy', () => {
  const g = gravityAtAltitude(400);
  assert.ok(g > 8.5 && g < 8.8);
  assert.equal(ENVIRONMENTS.iss.freeFall, true);
  assert.ok(ENVIRONMENTS.iss.gEff < 1e-4);
});
test('regime classification is ordinal, not predictive', () => {
  assert.equal(analyse({ gEff: 9.80665, flowCmS: 0, o2Pct: 20.9, pressureKPa: 101.3 }).regime, 'buoyancy');
  assert.equal(analyse({ gEff: ENVIRONMENTS.iss.gEff, flowCmS: 10, o2Pct: 20.9, pressureKPa: 101.3 }).regime, 'forced');
  assert.equal(analyse({ gEff: ENVIRONMENTS.iss.gEff, flowCmS: 0, o2Pct: 20.9, pressureKPa: 101.3 }).regime, 'diffusion');
  assert.equal(analyse({ gEff: 1.62, flowCmS: 20, o2Pct: 20.9, pressureKPa: 101.3 }).regime, 'mixed');
});
test('model output contains no spread rate, temperature or risk fields', () => {
  const r = analyse({ gEff: 9.8, flowCmS: 5, o2Pct: 21, pressureKPa: 101 });
  for (const k of Object.keys(r)) assert.ok(!/spread|risk|temperature|probab/i.test(k));
  assert.ok(Math.abs(o2PartialPressureKPa(20.9, 101.3) - 21.17) < 0.01);
});
