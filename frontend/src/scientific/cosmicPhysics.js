/** SOLARIS / COSMIC LAB — transparent educational approximations, NOT experimental predictors. */
export const AU_METERS = 149_597_870_700;
export const SOLAR_GM = 1.32712440018e20;

// Surface gravity values are approximate; atmospheres are broad educational benchmarks.
// Gas giants and the Sun have no selectable solid surface in this model.
export const BODIES = [
  { id:'sun', name:'Sun', orbit:0, au:0, period:1, phase:0, radius:1.55, color:'#ffcf74', gravity:274, surface:false, pressure:null, oxygen:null, kind:'Star' },
  { id:'mercury', name:'Mercury', orbit:2.8, au:0.387, period:87.97, phase:2.15, radius:.23, color:'#b8b9bd', gravity:3.70, surface:true, pressure:0, oxygen:0, kind:'Rocky world' },
  { id:'venus', name:'Venus', orbit:4.1, au:0.723, period:224.70, phase:4.6, radius:.37, color:'#ebc99b', gravity:8.87, surface:true, pressure:9200, oxygen:0, kind:'Rocky world' },
  { id:'earth', name:'Earth', orbit:5.55, au:1, period:365.26, phase:.6, radius:.41, color:'#53a9f4', gravity:9.807, surface:true, pressure:101.325, oxygen:20.95, kind:'Rocky world' },
  { id:'mars', name:'Mars', orbit:7.35, au:1.524, period:686.98, phase:3.1, radius:.30, color:'#d88a6d', gravity:3.71, surface:true, pressure:.636, oxygen:.16, kind:'Rocky world' },
  { id:'jupiter', name:'Jupiter', orbit:10.6, au:5.203, period:4332.6, phase:1.5, radius:.90, color:'#ddb89a', gravity:24.79, surface:false, pressure:null, oxygen:null, kind:'Gas giant' },
  { id:'saturn', name:'Saturn', orbit:14.2, au:9.58, period:10759, phase:3.8, radius:.73, color:'#decda1', gravity:10.44, surface:false, pressure:null, oxygen:null, kind:'Gas giant' },
  { id:'uranus', name:'Uranus', orbit:18, au:19.2, period:30688, phase:5.1, radius:.56, color:'#9de0e0', gravity:8.69, surface:false, pressure:null, oxygen:null, kind:'Ice giant' },
  { id:'neptune', name:'Neptune', orbit:21.8, au:30.07, period:60182, phase:2.7, radius:.55, color:'#5681d7', gravity:11.15, surface:false, pressure:null, oxygen:null, kind:'Ice giant' },
];
export const EARTH_MOON = {id:'moon',name:'Moon',orbit:0,au:1,period:27.3,phase:1.25,radius:.135,color:'#d6d9db',gravity:1.62,surface:true,pressure:0,oxygen:0,kind:'Natural satellite'};
export const BODY_LOOKUP = Object.fromEntries([...BODIES, EARTH_MOON].map(b => [b.id, b]));

export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
export function solarGravityAtAU(au) {
  if (!Number.isFinite(au) || au <= 0) return null;
  return SOLAR_GM / Math.pow(au * AU_METERS, 2);
}
export function displayRadiusToAU(distance) {
  // The drawn Solar System is intentionally not to physical scale. This mapping
  // is only used to associate schematic space clicks with heliocentric AU.
  const anchors = BODIES.filter(b => b.au>0);
  const r = clamp(distance, anchors[0].orbit, anchors[anchors.length-1].orbit);
  const upper = anchors.findIndex(b => b.orbit >= r);
  if (upper <= 0) return anchors[0].au;
  const a = anchors[upper-1], b = anchors[upper];
  const t = (r-a.orbit)/(b.orbit-a.orbit);
  return Math.exp(Math.log(a.au) + t*(Math.log(b.au)-Math.log(a.au)));
}
export function getOrbitPosition(body, day=0) {
  if(body.id==='sun') return {x:0,y:0,z:0};
  const theta = body.phase + day * 2*Math.PI/body.period;
  return {x:body.orbit*Math.cos(theta), y:0, z:body.orbit*Math.sin(theta)};
}
export function getMoonPosition(day=0) {
  const earth = getOrbitPosition(BODY_LOOKUP.earth, day);
  const phase=EARTH_MOON.phase + day*2*Math.PI/EARTH_MOON.period;
  return { x:earth.x+Math.cos(phase)*.85, y:Math.sin(phase*.91)*.08, z:earth.z+Math.sin(phase)*.85 };
}
/**
 * A visual *score*, NOT calibrated probability/likelihood or NASA-derived prediction.
 * Generic flame in a chamber: intentionally simplistic pressure/O2/airflow/acceleration.
 * No temperature, fuel chemistry, flammability or detailed extinction solver.
 */
export function evaluateFlame({ pressureKPa=101.325, oxygenPercent=20.95, airflow=0.04, effectiveGravity=9.807, fuel='wick' }={}) {
  const p=clamp(Number(pressureKPa)||0,0,200);
  const o=clamp(Number(oxygenPercent)||0,0,100);
  const f=clamp(Number(airflow)||0,0,2);
  const g=clamp(Number(effectiveGravity)||0,0,30);
  const po2=p*(o/100);
  // Only an illustrative tunable, bounded index. Deliberately avoids calling
  // this a 68/95% confidence interval or a probability of ignition.
  const oxygenSupport=clamp((po2-5)/15,0,1);
  const pressureSupport=clamp((p-2)/28,0,1);
  const forcedFlowSupport=clamp(1-Math.max(0,f-.9)*.65,.25,1);
  const potential=oxygenSupport*pressureSupport*forcedFlowSupport;
  const score=Math.round(100*potential);
  const buoyancy=clamp(Math.sqrt(g/9.807),0,1.7);
  const flowEffect=clamp(f/1.5,0,1);
  const roundness=clamp(1 - .74*buoyancy - .35*flowEffect,0,1);
  const tiltDegrees=(flowEffect*58)/(1+.55*buoyancy);
  const relativeHeight=clamp(.85 + 1.1*buoyancy + .5*flowEffect,.6,2.9);
  const isVisible=score>5;
  let regime='Low oxidizer support';
  if(score>65) regime=buoyancy<.1 && flowEffect<.15 ? 'Diffusion-dominated / rounded' : (flowEffect>.28 ? 'Flow-influenced flame' : 'Buoyancy-influenced flame');
  else if(score>5) regime='Marginal illustrative combustion';
  if(!isVisible) regime='No sustained flame in this illustration';
  const messages=[];
  if(po2<8) messages.push('Low oxygen partial pressure: the visual model suppresses the flame. This is not a universal extinction threshold.');
  if(g<.02) messages.push('Freefall suppresses effective buoyancy despite nonzero gravitational fields.');
  if(f>.2) messages.push('Imposed airflow can elongate the flame even in microgravity.');
  if(p>160) messages.push('High pressure is outside the intended model range; do not interpret this as experimental behavior.');
  if(fuel!=='wick') messages.push('Fuel presets alter the illustration only; they are not fuel-specific reaction kinetics.');
  return {
    score, regime, isVisible, roundness, tiltDegrees, relativeHeight,
    oxygenPartialKPa:po2, buoyancyIndex:buoyancy, flowEffect, messages,
    applicability:'UNCALIBRATED EDUCATIONAL MODEL',
    accuracyPercent:null,
  };
}
export function getEnvironment(bodyId, mode='sealed', gravityMode='freefall', spacecraftAccel=0, locationAU=1) {
  const body=BODY_LOOKUP[bodyId];
  const validSurface=!!body?.surface;
  const effectiveMode=gravityMode==='surface'&&validSurface?'surface':gravityMode==='accelerating'?'accelerating':'freefall';
  const effectiveGravity=effectiveMode==='surface'?body.gravity:effectiveMode==='accelerating'?clamp(spacecraftAccel,0,15):0;
  const externalKnown=mode==='ambient'&&(validSurface || !body);
  return {
    effectiveMode,effectiveGravity,
    pressureKPa:mode==='sealed'?101.325:externalKnown?body.pressure:0,
    oxygenPercent:mode==='sealed'?20.95:externalKnown?body.oxygen:0,
    solarField:solarGravityAtAU(body?.au > 0 ? body.au : locationAU),
    ambientKnown: mode==='sealed'||externalKnown,
    // No atmosphere is inferred for an arbitrary position in deep space.
  };
}
