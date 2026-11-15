import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrich, materialGroup, recordYear, applyFilters, sortRecords,
  coverageCount, isValidOxygen, describe, toCSV, oxygenBin
} from '../src/features/data-atlas/analysis.js';

const source = enrich([
  {id:'B1',fuel:'100 micron PMMA film 2 cm wide',date:'2/19/2014',initial_oxygen_pct:22.2,final_oxygen_pct:22.2,flow_restrictor:'2',air_display:'5',fan_display:'62',source_url:'https://psi.nasa.gov/x'},
  {id:'B2',fuel:'2 cm SIBAL',date:'7/7/2014',initial_oxygen_pct:17.2,final_oxygen_pct:null,flow_restrictor:'',air_display:'5',fan_display:'',source_url:'https://psi.nasa.gov/x'},
  {id:'B14',fuel:'1/4 clear rod',date:'invalid',initial_oxygen_pct:null,final_oxygen_pct:101,flow_restrictor:null,air_display:'',fan_display:'',source_url:'https://psi.nasa.gov/x'},
]);

test('material categories do not infer unnamed rod composition',()=>{
  assert.equal(materialGroup('1/4 clear rod'),'Other descriptions');
  assert.equal(materialGroup('PMMA film'),'PMMA (explicit)');
  assert.equal(materialGroup('1 cm SIBAL'),'SIBAL (explicit)');
});
test('dates and oxygen are validated rather than extrapolated',()=>{
  assert.equal(recordYear('2/19/2014'),2014);
  assert.equal(recordYear('2/31/2014'),null);
  assert.equal(isValidOxygen(101),false);
  assert.equal(oxygenBin(22.2),22);
  assert.equal(oxygenBin(null),null);
});
test('coverage does not count out-of-range oxygen',()=>{
  assert.equal(coverageCount(source[0]),7);
  assert.equal(coverageCount(source[1]),4);
  assert.equal(coverageCount(source[2]),1);
});
test('search, material and quality filters combine correctly',()=>{
  assert.deepEqual(applyFilters(source,{search:'PMMA',material:'PMMA (explicit)',year:'all',oxygen:'all',quality:'complete'}).map(r=>r.id),['B1']);
  assert.deepEqual(applyFilters(source,{search:'',material:'all',year:'all',oxygen:'16',quality:'all'}).map(r=>r.id),['B2']);
  assert.deepEqual(applyFilters(source,{search:'',material:'all',year:'unknown',oxygen:'all',quality:'review'}).map(r=>r.id),['B14']);
});
test('ranking is metadata coverage only',()=>{
  assert.deepEqual(sortRecords(source,'coverage').map(r=>r.id), ['B1','B2','B14']);
  assert.equal(describe(source).oxygenCount,2);
});
test('filtered CSV does not permit basic spreadsheet formula injection',()=>{
  const txt=toCSV(enrich([{id:'B9',fuel:'=HYPERLINK("evil")',date:'2/19/2014',initial_oxygen_pct:20,final_oxygen_pct:null,air_display:'',fan_display:'',flow_restrictor:''}]));
  assert.ok(txt.includes("'=HYPERLINK"));
  assert.ok(txt.startsWith('\ufeff'));
});
