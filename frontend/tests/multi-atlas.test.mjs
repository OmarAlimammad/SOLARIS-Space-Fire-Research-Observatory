import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultView, restoreView, queryFor, togglePin} from '../src/features/data-atlas/workspace.js';

test('restores only valid state for the requested source', () => {
  const value = {search:'C2H4', page:7, field:'Fuel', rules:[null, {field:'Fuel',op:'eq',value:'C2H4'}],
    pins:['acme-inverse:row:5','acme-normal:row:120','acme-normal:row:bad']};
  const storage = { getItem: key => key.endsWith('acme-normal') ? JSON.stringify(value) : null };
  const restored = restoreView('acme-normal', storage);
  assert.deepEqual(restored.pins, ['acme-normal:row:120']);
  assert.deepEqual(restored.rules, [value.rules[1]]);
  assert.equal(restored.page, 0);
  assert.deepEqual(restoreView('acme-inverse', storage), defaultView());
});

test('row, summary and export requests carry the same exact source filters', () => {
  const rule = {field:'Calibrated  initial O2 % by vol ',op:'gte',value:'20'};
  const state = {...defaultView(), search:'PMMA + Nomex', rules:[rule]};
  const rows = new URLSearchParams(queryFor(state, {offset:25}));
  const exported = new URLSearchParams(queryFor(state));
  assert.equal(rows.get('search'), state.search);
  assert.equal(rows.get('filters'), exported.get('filters'));
  assert.deepEqual(JSON.parse(rows.get('filters')), [rule]);
  assert.deepEqual(togglePin(togglePin([], 'acme-normal:row:1'), 'acme-normal:row:1'), []);
});
