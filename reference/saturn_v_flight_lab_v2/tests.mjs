import assert from 'node:assert/strict';
import {CONSTANTS,STAGES,BASE_RATIO,BASE_MASS,PAYLOAD,atmosphere,cdFromMach,gravity,simulate,rk4,stagesFor,orbitElements,V} from './physics.mjs';
let count=0;
function test(name,fn){try{fn();console.log('  ✓',name);count++;}catch(e){console.error('  ✕',name);throw e;}}
const approx=(a,b,rel=.01)=>Math.abs(a-b)<=rel*Math.max(1,Math.abs(b));
console.log('SATURN V V2 • PHYSICS VERIFICATION');

test('1976 atmosphere sea-level density, temperature, pressure and sound',()=>{
 const a=atmosphere(0);assert(approx(a.rho,1.225,.0001));assert(approx(a.T,288.15,.00001));assert(approx(a.pressure,101325,.00001));assert(approx(a.sound,340.294,.0001));
});
test('atmosphere near standard 11 km and 20 km',()=>{
 const a=atmosphere(11000),b=atmosphere(20000);assert(approx(a.pressure,22632,.005));assert(approx(b.rho,.0880,.015));assert(a.rho>b.rho);
});
test('extremely thin high atmosphere and finite returns',()=>{
 for(const h of [0,20000,86000,120000,180000,230000]){
  const a=atmosphere(h);for(const k of ['T','pressure','rho','sound'])assert(Number.isFinite(a[k]));
  assert(a.rho>=0&&a.pressure>=0);
 }
 assert(atmosphere(200000).rho===0);
});
test('Mach peak drag and user Cd scale',()=>{
 assert(cdFromMach(1.2)>cdFromMach(.2));assert(cdFromMach(1.2)>cdFromMach(3));
 assert(approx(cdFromMach(2,2),2*cdFromMach(2),1e-10));
});
test('stage mass is positive and first-stage ratio precisely requested',()=>{
 for(const ratio of [1.4,2.3,BASE_RATIO,4.9,6]){
  const {stage,launchMass,payload}=stagesFor({ratio,payloadFactor:1,throttle:1});
  assert(approx(launchMass/(launchMass-stage[0].prop),ratio,1e-11));
  assert(launchMass>payload&&stage.every(x=>x.mdot>0&&x.prop>0&&x.dry>0));
 }
});
test('gravity inverse-square, and J2 perturbation small near surface',()=>{
 const p=[CONSTANTS.Re,0,0];const g0=V.mag(gravity(p,false));
 assert(approx(V.mag(gravity(V.mul(p,2),false)),g0/4,1e-11));
 assert(Math.abs(V.mag(gravity(p,true))-g0)<.025);
});
let mission;
test('nominal Saturn V three burn cutoffs and event sequence',()=>{
 mission=simulate();assert.equal(mission.cutoff.length,3);
 assert(mission.cutoff[0].t>145&&mission.cutoff[0].t<180);
 assert(mission.cutoff[1].t>480&&mission.cutoff[1].t<550);
 assert(mission.cutoff[2].t>mission.cutoff[1].t);
 assert(mission.events.filter(x=>x.type==='stage').length===2);
 assert(mission.events.filter(x=>x.type==='cutoff').length===3);
 assert(approx(mission.launchMass,BASE_MASS,.00001));
});
test('stage jettison reduces mass exactly by its dry mass',()=>{
 for(let stageIndex=0;stageIndex<2;stageIndex++){
  const e=mission.events.find(x=>x.type==='stage'&&x.text.startsWith(STAGES[stageIndex].name));
  const snap=mission.samples.filter(s=>Math.abs(s.t-e.t)<1e-7);
  assert(snap.length>=2);
  const before=snap.find(s=>s.stage===stageIndex),after=snap.find(s=>s.stage===stageIndex+1);
  assert(before&&after);
  assert(approx(before.m-after.m,mission.stages[stageIndex].dry,1e-9));
 }
});
test('mass declines during burn and is conserved during coast',()=>{
 const a=mission.samples;
 for(let i=1;i<a.length;i++){
  const u=a[i-1],v=a[i];if(u.stage!==v.stage||u.t===v.t)continue;
  if(u.engine&&v.engine) assert(v.m<=u.m+.1);
  if(!u.engine&&!v.engine)assert(approx(v.m,u.m,1e-11));
 }
});
test('nominal launch T/W ~1.17, Max-Q within reasonable magnitude',()=>{
 assert(mission.twAtLiftoff>1.1&&mission.twAtLiftoff<1.25);
 assert(mission.maxQ.value>20000&&mission.maxQ.value<80000);
});
test('experimental orbital target is reached; perigee positive',()=>{
 const e=mission.events.find(x=>x.type==='orbit');assert(e);
 const state=mission.samples.findLast(s=>s.t<=e.t+1e-7);
 assert(state.orbit.perigee>170000);
 assert(state.orbit.eccentricity<.1);
 assert(mission.orbit.orbital);
});
test('integration converges with halved RK4 time step',()=>{
 const fast=simulate({dt:1.2,coastTo:950});const fine=simulate({dt:.45,coastTo:950});
 assert(Math.abs(fast.cutoff[0].t-fine.cutoff[0].t)<.001);
 assert(Math.abs(fast.cutoff[1].t-fine.cutoff[1].t)<.001);
 assert(Math.abs(fast.cutoff.at(-1).t-fine.cutoff.at(-1).t)<3);
 const a=fast.cutoff.at(-1),b=fine.cutoff.at(-1);
 assert(Math.abs(a.alt-b.alt)<25000);
});
test('vacuum coasting central gravity preserves energy on circular orbit',()=>{
 const r=CONSTANTS.Re+300000,v=Math.sqrt(CONSTANTS.mu/r);
 let y=[r,0,0,0,v,0,1000];const c={atmosphere:false,rotation:false,j2:false,lift:false,limitAoA:5,pitchStart:0,pitchEnd:100,pitchFinal:80,cdScale:1,windEast:0};
 const before=orbitElements(y);
 for(let i=0;i<1000;i++)y=rk4(y,i*5,5,c,STAGES[0],3,false);
 const after=orbitElements(y);
 assert(approx(after.energy,before.energy,1e-9));
 assert(Math.abs(after.apogee-before.apogee)<100);
});
test('vacuum option removes atmospheric pressure and q',()=>{
 const a=simulate({atmosphere:false,coastTo:900});
 assert(a.samples.every(x=>x.q===0&&x.pressure===0));
});
test('nondefault wind/drag/throttle alter trajectory without NaN',()=>{
 const a=simulate({windEast:35,cdScale:1.3,throttle:.9,coastTo:900});
 assert(a.samples.length>300);
 assert(a.samples.every(s=>Number.isFinite(s.alt)&&Number.isFinite(s.m)&&Number.isFinite(s.speed)));
 const b=mission.samples.find(s=>s.t>100),c=a.samples.find(s=>s.t>100);
 assert(Math.abs(b.speed-c.speed)>1);
});
test('invalid settings are rejected',()=>{
 assert.throws(()=>simulate({ratio:0.8}),/Parameter/);
 assert.throws(()=>simulate({pitchEnd:5,pitchStart:10}),/Parameter/);
});
console.log(`\nPASS: ${count} independent checks. Note: these are numerical/software tests, NOT flight certification.`);
