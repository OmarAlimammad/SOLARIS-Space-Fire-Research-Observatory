import test from 'node:test';
import assert from 'node:assert/strict';
import { solarGravityAtAU, displayRadiusToAU, BODY_LOOKUP, getEnvironment, evaluateFlame, getOrbitPosition } from '../src/scientific/cosmicPhysics.js';

test('solar gravitational field at 1 AU is nonzero', () => assert.ok(Math.abs(solarGravityAtAU(1)-0.00593)<0.0001));
test('schematic orbit map respects actual AU anchors', () => assert.equal(displayRadiusToAU(5.55),1));
test('Earth surface and freefall have different effective acceleration', () => {
  assert.ok(getEnvironment('earth','sealed','surface').effectiveGravity>9);
  assert.equal(getEnvironment('earth','sealed','freefall').effectiveGravity,0);
  assert.ok(getEnvironment('earth','sealed','freefall').solarField>0);
});
test('vacuum does not maintain visible candle-like flame', () => {
  const x=evaluateFlame({pressureKPa:0,oxygenPercent:0,effectiveGravity:1.62});
  assert.equal(x.score,0); assert.equal(x.isVisible,false);
});
test('sealed freefall lab can support rounded flame illustration', () => {
  const x=evaluateFlame({pressureKPa:101.325,oxygenPercent:20.95,airflow:0,effectiveGravity:0});
  assert.ok(x.score>80); assert.ok(x.roundness>.9);
  assert.equal(x.accuracyPercent,null);
});
test('gas giant never incorrectly claims a solid-surface scene', () => {
  const x=getEnvironment('jupiter','ambient','surface');
  assert.equal(x.effectiveMode,'freefall'); assert.equal(x.ambientKnown,false);
});
test('orbital angle changes with time', () => assert.notDeepEqual(getOrbitPosition(BODY_LOOKUP.earth,0),getOrbitPosition(BODY_LOOKUP.earth,365.26/2)));

test('all planetary bodies support transparent sealed-chamber scenarios', () => {
  for (const id of Object.keys(BODY_LOOKUP)) {
    const env=getEnvironment(id, 'sealed', 'freefall');
    const r=evaluateFlame({pressureKPa:101.3,oxygenPercent:20.95,effectiveGravity:env.effectiveGravity,airflow:.04});
    assert.ok(r.isVisible, `Sealed chamber should illustrate oxidizer support for ${id}`);
    assert.equal(r.accuracyPercent,null);
  }
});
test('ambient Mars and Moon do not receive fabricated flame illustrations', () => {
  for (const id of ['mercury','venus','mars','moon']) {
    const env=getEnvironment(id,'ambient','surface');
    const r=evaluateFlame({pressureKPa:env.pressureKPa,oxygenPercent:env.oxygenPercent,effectiveGravity:env.effectiveGravity});
    assert.equal(r.isVisible,false, `${id}: no sustained ambient flame without oxidizer`);
  }
});
test('changing gravity changes the flame geometry, not the selected oxygen score', () => {
  const low=evaluateFlame({pressureKPa:101.3,oxygenPercent:20.95,effectiveGravity:0});
  const earth=evaluateFlame({pressureKPa:101.3,oxygenPercent:20.95,effectiveGravity:9.807});
  assert.equal(low.score,earth.score);
  assert.ok(low.roundness>earth.roundness);
  assert.ok(earth.relativeHeight>low.relativeHeight);
});
