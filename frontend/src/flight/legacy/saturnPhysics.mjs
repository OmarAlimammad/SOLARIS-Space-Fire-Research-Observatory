/** Saturn V Flight Lab 2.0 — dimensioned SI units. Educational 3-DOF point mass. */
export const CONSTANTS = Object.freeze({
  mu: 3.986004418e14, Re: 6371000, omega: 7.2921159e-5, J2: 1.08262668e-3,
  g0: 9.80665, gasR: 287.05287, gamma: 1.4, seaPressure: 101325,
  latitude: 28.6084 * Math.PI / 180,
});
const {mu, Re, omega, J2, g0, gasR, gamma} = CONSTANTS;
export const STAGES = Object.freeze([
  // NASA 2024 LV loads/sizing: 5039/4683/355, 1090/998/92, 265/236/29 klbm.
  // Engine properties rounded from NASA engine systems; NOT vehicle-specific measured telemetry.
  {name:'S-IC', engine:'5 × F-1', prop:4683*453.59237, dry:355*453.59237,
   ispSL:263, ispVac:304, thrustSL:7.61e6*4.448221615, area:78.5, noseRadius:5.0},
  {name:'S-II', engine:'5 × J-2', prop:998*453.59237, dry:92*453.59237,
   ispVac:421, thrustVac:1.15e6*4.448221615, exitArea:15, area:78.5, noseRadius:5},
  {name:'S-IVB', engine:'1 × J-2', prop:236*453.59237, dry:29*453.59237,
   ispVac:421, thrustVac:230000*4.448221615, exitArea:3.5, area:36.6, noseRadius:3.3},
]);
export const PAYLOAD = 118*453.59237;
export const BASE_MASS = PAYLOAD + STAGES.reduce((v,s)=>v+s.prop+s.dry,0);
export const BASE_RATIO = BASE_MASS/(BASE_MASS - STAGES[0].prop);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mag=a=>Math.hypot(...a);
const unit=a=>mul(a,1/(mag(a)||1));
const lerp=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>unit(add(mul(a,1-t),mul(b,t)));
export const V={add,sub,mul,dot,cross,mag,unit};

/** COESA 1976 hydrostatic lower atmosphere, with approximate exponential extension >86km. */
const BASE_H=[0,11000,20000,32000,47000,51000,71000,84852];
const LAPSE=[-0.0065,0,0.001,0.0028,0,-0.0028,-0.002];
const BASE_T=[288.15],BASE_P=[101325];
for(let i=0;i<LAPSE.length;i++){
  const H=BASE_H[i+1]-BASE_H[i], L=LAPSE[i], T=BASE_T[i], P=BASE_P[i];
  const Tn=T+L*H;
  BASE_T.push(Tn);
  BASE_P.push(Math.abs(L)<1e-12 ? P*Math.exp(-g0*H/(gasR*T)) : P*Math.pow(Tn/T,-g0/(gasR*L)));
}
export function atmosphere(altitude){
  const h=Math.max(0,altitude), H=Re*h/(Re+h);
  let T,P;
  if(H<=84852){
    let i=LAPSE.length-1;
    for(let k=0;k<LAPSE.length;k++){if(H<BASE_H[k+1]){i=k;break;}}
    const dz=H-BASE_H[i],L=LAPSE[i];
    T=BASE_T[i]+L*dz;
    P=Math.abs(L)<1e-12 ? BASE_P[i]*Math.exp(-g0*dz/(gasR*T)) : BASE_P[i]*Math.pow(T/BASE_T[i],-g0/(gasR*L));
  }else{
    // Upper air is a rough density tail, not the detailed COESA thermosphere model.
    T=186.946;
    P=BASE_P.at(-1)*Math.exp(-(h-86000)/7200);
    if(h>=190000)P=0;
  }
  const rho=Math.max(0,P/(gasR*T));
  return {T, pressure:Math.max(0,P), rho, sound:Math.sqrt(gamma*gasR*T), geopotential:H};
}
/** Approximate Cd(M) curve; user-adjustable multiplier; NOT Saturn V measured wind-tunnel data. */
const CD_TABLE=[[0,.30],[.6,.33],[.9,.42],[1,.57],[1.2,.62],[1.6,.40],[2.5,.30],[4,.26],[7,.25],[12,.26],[25,.28]];
export function cdFromMach(M,scale=1){
  if(!Number.isFinite(M)||M<=0)return CD_TABLE[0][1]*scale;
  for(let i=1;i<CD_TABLE.length;i++)if(M<=CD_TABLE[i][0]){
    const a=CD_TABLE[i-1],b=CD_TABLE[i]; return lerp(a[1],b[1],(M-a[0])/(b[0]-a[0]))*scale;
  }
  return CD_TABLE.at(-1)[1]*scale;
}
function normalizeConfig(user={}){
  const defaults={ratio:BASE_RATIO,v0:0,payloadFactor:1,throttle:1,cdScale:1,windEast:0,
    pitchStart:0,pitchEnd:265,pitchFinal:80,limitAoA:5,
    atmosphere:true,rotation:true,j2:true,lift:true,staging:true,targetOrbit:true,
    dt:0.75,coastTo:2300,stage3Burn:420};
  const c={...defaults,...user};
  for(const k of ['ratio','v0','payloadFactor','throttle','cdScale','windEast','pitchStart','pitchEnd','pitchFinal','limitAoA','dt','coastTo','stage3Burn']){
    if(!Number.isFinite(c[k]))throw Error(`Invalid ${k}`);
  }
  if(c.ratio<=1.01||c.ratio>7 || c.v0<0 || c.v0>4000 || c.payloadFactor<.3||c.payloadFactor>4 || c.throttle<=0||c.throttle>1.15 || c.dt<.1||c.dt>3 || c.coastTo<300||c.coastTo>20000 || c.pitchEnd<=c.pitchStart+10)
    throw Error('Parameter outside allowed range');
  return c;
}
export function stagesFor(c){
  const stage=STAGES.map(s=>({...s}));
  const payload=PAYLOAD*c.payloadFactor;
  const rest=payload+stage.reduce((v,s)=>v+s.dry,0)+stage[1].prop+stage[2].prop;
  stage[0].prop=rest*(c.ratio-1);
  for(let i=0;i<stage.length;i++){
    const s=stage[i];
    s.mdot=(i===0 ? s.thrustSL/(s.ispSL*g0) : s.thrustVac/(s.ispVac*g0))*c.throttle;
    if(i===0){s.thrustVac=s.mdot*s.ispVac*g0;s.exitArea=(s.thrustVac-s.thrustSL*c.throttle)/CONSTANTS.seaPressure;}
    else s.thrustVac*=c.throttle;
  }
  return {stage,payload,launchMass:payload+stage.reduce((a,s)=>a+s.prop+s.dry,0)};
}
export function initialState(c){
  const cl=Math.cos(CONSTANTS.latitude),sl=Math.sin(CONSTANTS.latitude);
  const r=[Re*cl,0,Re*sl], up=unit(r);
  const ground=c.rotation?cross([0,0,omega],r):[0,0,0];
  return {r, v:add(ground,mul(up,c.v0))};
}
export function gravity(r,withJ2=true){
  const rm=mag(r),rr=rm*rm,z2=r[2]*r[2];
  const newton=mul(r,-mu/(rm*rm*rm));
  if(!withJ2)return newton;
  const k=1.5*J2*mu*Re*Re/Math.pow(rm,5);
  return add(newton,[k*r[0]*(5*z2/rr-1),k*r[1]*(5*z2/rr-1),k*r[2]*(5*z2/rr-3)]);
}
/** Inertial local east and up. A commanded pitch schedule (not a closed-loop guidance system). */
function commandedDirection(r,t,c){
  const up=unit(r), east=unit([-r[1],r[0],0]);
  const s=clamp((t-c.pitchStart)/(c.pitchEnd-c.pitchStart),0,1);
  const angle=(c.pitchFinal*Math.PI/180) * (s*s*(3-2*s));
  return unit(add(mul(up,Math.cos(angle)),mul(east,Math.sin(angle))));
}
function wind(r,alt,c){
  const rotational = c.rotation?cross([0,0,omega],r):[0,0,0];
  const factor=(1-Math.exp(-Math.max(0,alt)/700))*Math.exp(-Math.max(0,alt)/17000);
  return add(rotational,mul(unit([-r[1],r[0],0]),c.windEast*factor));
}
export function diagnostics(state,c,stage,idx,t,engine=true){
  const r=state.slice(0,3),v=state.slice(3,6),m=state[6],alt=mag(r)-Re;
  const up=unit(r), atm=c.atmosphere?atmosphere(alt):{rho:0,pressure:0,T:288.15,sound:340.294};
  const vrel=sub(v,wind(r,alt,c)), vAir=mag(vrel), flow=unit(vrel);
  const M=vAir/atm.sound, q=.5*atm.rho*vAir*vAir;
  const cmd=commandedDirection(r,t,c);
  const rawAngle=Math.acos(clamp(dot(cmd,flow),-1,1));
  // At significant q, guide thrust axis close to relative wind; proxy AoA-limited steering.
  const limit=c.limitAoA*Math.PI/180;
  const body = (vAir>110 && q>1500 && rawAngle>limit) ? blend(flow,cmd,Math.min(1,limit/rawAngle)) : cmd;
  const aoa=vAir>2?Math.acos(clamp(dot(flow,body),-1,1)):0;
  const Cd=cdFromMach(M,c.cdScale)*(1+1.5*Math.sin(aoa)**2);
  const area=stage?.area??STAGES[2].area;
  const drag=vAir>1e-8 ? mul(vrel,-q*Cd*area/vAir) : [0,0,0];
  const side=sub(body,mul(flow,dot(body,flow)));
  const lift=(c.lift && vAir>2)?mul(unit(side),q*area*clamp(1.6*aoa,0,.5)): [0,0,0];
  const thrust=engine && stage?Math.max(0,stage.thrustVac-atm.pressure*stage.exitArea):0;
  const aero=add(drag,lift);
  const accelNonGrav=mul(add(mul(body,thrust),aero),1/m);
  const gravitational=gravity(r,c.j2);
  const acceleration=add(accelNonGrav,gravitational);
  const horiz=mag(sub(v,mul(up,dot(v,up))));
  const radialSpeed=dot(v,up);
  // Sutton-Graves form used only as an order-of-magnitude heating proxy.
  const heat=1.83e-4*Math.sqrt(Math.max(0,atm.rho)/(stage?.noseRadius??3.3))*vAir**3;
  return {alt,m,atm,q,M,Cd,aoa:aoa*180/Math.PI,body,cmd,drag:mag(drag),lift:mag(lift),thrust,
    acceleration, accelNonGrav,gLoad:mag(accelNonGrav)/g0,radialSpeed,horizontalSpeed:horiz,vAir,
    speed:mag(v),heat,vr:vrel,gravity:mag(gravitational),stageIndex:idx};
}
function derivative(y,t,c,stage,idx,engine){
  const d=diagnostics(y,c,stage,idx,t,engine);
  return [y[3],y[4],y[5],...d.acceleration,engine? -stage.mdot:0];
}
function axpy(a,b,f){return a.map((v,i)=>v+b[i]*f);}
export function rk4(y,t,h,c,stage,idx,engine){
  const k1=derivative(y,t,c,stage,idx,engine);
  const k2=derivative(axpy(y,k1,h/2),t+h/2,c,stage,idx,engine);
  const k3=derivative(axpy(y,k2,h/2),t+h/2,c,stage,idx,engine);
  const k4=derivative(axpy(y,k3,h),t+h,c,stage,idx,engine);
  return y.map((x,i)=>x+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6);
}
export function orbitElements(y){
  const r=y.slice(0,3),v=y.slice(3,6),R=mag(r),v2=dot(v,v),hvec=cross(r,v),h=mag(hvec);
  const energy=v2/2-mu/R;
  const evec=sub(mul(cross(v,hvec),1/mu),mul(r,1/R));
  const eccentricity=mag(evec);
  let apogee=null,perigee=null,a=null;
  if(energy<0){a=-mu/(2*energy);apogee=a*(1+eccentricity)-Re;perigee=a*(1-eccentricity)-Re;}
  const inclination=h>0 ? Math.acos(clamp(hvec[2]/h,-1,1))*180/Math.PI:null;
  return {apogee,perigee,eccentricity,a,inclination,energy,orbital:perigee!==null&&perigee>120000};
}
function groundRange(r,t,c){
  const init=initialState(c).r;
  // Rotate inertial position back into Earth-fixed coordinates.
  const w=c.rotation?omega*t:0, co=Math.cos(w),si=Math.sin(w);
  const fixed=[co*r[0]+si*r[1],-si*r[0]+co*r[1],r[2]];
  return Re*Math.acos(clamp(dot(unit(init),unit(fixed)),-1,1));
}
function sample(y,t,c,stages,idx,stageEngine,launchMass){
  const stage=stages[Math.min(idx,2)];
  const d=diagnostics(y,c,stage,idx,t,stageEngine);
  const o=orbitElements(y);
  return {t,r:y.slice(0,3),v:y.slice(3,6),m:y[6],alt:d.alt,radialSpeed:d.radialSpeed,
    horizontalSpeed:d.horizontalSpeed,speed:d.speed,q:d.q,M:d.M,gLoad:d.gLoad,thrust:d.thrust,
    fuelFraction:Math.max(0,Math.min(1,(y[6]-c.payloadFactor*PAYLOAD-stages[Math.min(idx,2)].dry-stages.slice(Math.min(idx,2)+1).reduce((v,s)=>v+s.dry+s.prop,0))/Math.max(1,stages[Math.min(idx,2)].prop))),
    stage:idx,engine:stageEngine,aoa:d.aoa,Cd:d.Cd,drag:d.drag,lift:d.lift,heat:d.heat,
    rho:d.atm.rho,temperature:d.atm.T,pressure:d.atm.pressure,sound:d.atm.sound,
    grav:d.gravity,range:groundRange(y.slice(0,3),t,c),pitch:Math.acos(clamp(dot(d.body,unit(y.slice(0,3))),-1,1))*180/Math.PI,
    heading:d.body,orbit:o};
}
export function simulate(user={}){
  const c=normalizeConfig(user);
  const {stage,payload,launchMass}=stagesFor(c);
  const init=initialState(c);
  let y=[...init.r,...init.v,launchMass],t=0,idx=0,engine=true;
  let burnClock=0;
  const events=[{t:0,type:'liftoff',text:'IGNITION · S-IC / 5 × F-1'}];
  const samples=[];
  const initial=sample(y,t,c,stage,idx,engine,launchMass);
  samples.push(initial);
  let maxQ={value:0,t:0}, maxG={value:0,t:0},maxAlt={value:0,t:0}, crossing100=false;
  let burnouts=[];
  let stopped=false;
  for(let n=0;n<35000 && t<c.coastTo-1e-6;n++){
    let duration=engine?(idx===2?Math.min(c.stage3Burn,stage[idx].prop/stage[idx].mdot):stage[idx].prop/stage[idx].mdot):Infinity;
    const left=engine?Math.max(0,duration-burnClock):Infinity;
    if(engine&&left<1e-7){
      events.push({t,type:'cutoff',text:`${stage[idx].name} · ENGINE CUTOFF`});
      burnouts.push({t,stage:idx,m:y[6],alt:mag(y.slice(0,3))-Re});
      if(idx<2){
        y[6]-=stage[idx].dry;
        events.push({t,type:'stage',text:`${stage[idx].name} SEPARATED · ${Math.round(stage[idx].dry/1000)} t JETTISONED`});
        idx++;burnClock=0;engine=true;
        events.push({t,type:'ignition',text:`${stage[idx].name} · ${stage[idx].engine} IGNITION`});
      }else{idx=3;engine=false;events.push({t,type:'coast',text:'S-IVB FIRST BURN COMPLETE · COAST'});}
      samples.push(sample(y,t,c,stage,idx,engine,launchMass));
      continue;
    }
    const h=Math.min(c.dt,t>950?Math.max(1.5,c.dt):c.dt,c.coastTo-t,left);
    if(h<1e-8)break;
    const oldAlt=mag(y.slice(0,3))-Re;
    const next=rk4(y,t,h,c,stage[Math.min(idx,2)],idx,engine);
    t+=h;
    if(engine)burnClock+=h;
    y=next;
    const altitude=mag(y.slice(0,3))-Re;
    if(!Number.isFinite(altitude)||!Number.isFinite(y[6])||y[6]<=0)throw Error('Numerical instability');
    if(altitude<0){
      if(oldAlt<2 && engine){ // remain on pad until upward net thrust overcomes gravity
        const up=unit(y.slice(0,3));y.splice(0,3,...mul(up,Re));
        y.splice(3,3,...(c.rotation?cross([0,0,omega],y.slice(0,3)):[0,0,0]));
      }else{
        const up=unit(y.slice(0,3));y.splice(0,3,...mul(up,Re));
        events.push({t,type:'impact',text:'GROUND CONTACT / SIMULATION ENDED'});
        stopped=true;
      }
    }
    const s=sample(y,t,c,stage,idx,engine,launchMass);
    samples.push(s);
    if(s.engine && s.radialSpeed>0 && s.q>maxQ.value)maxQ={value:s.q,t};
    if(s.gLoad>maxG.value)maxG={value:s.gLoad,t};
    if(s.alt>maxAlt.value)maxAlt={value:s.alt,t};
    if(engine && idx===2 && c.targetOrbit && s.alt>=170000 && s.orbit.perigee!==null && s.orbit.perigee>=175000 && s.orbit.apogee>=180000){
      burnClock=Math.min(c.stage3Burn,stage[2].prop/stage[2].mdot);
      events.push({t,type:'orbit',text:'TARGET PERIGEE REACHED · ORBIT INSERTION'});
    }
    if(!crossing100 && s.alt>=100000){crossing100=true;events.push({t,type:'space',text:'100 KM · KÁRMÁN LINE CROSSED'});}
    if(stopped)break;
  }
  if(maxQ.t>0)events.push({t:maxQ.t,type:'maxq',text:`MAX-Q · ${(maxQ.value/1000).toFixed(1)} kPa`});
  if(maxG.t>0)events.push({t:maxG.t,type:'maxg',text:`PEAK SPECIFIC FORCE · ${maxG.value.toFixed(2)} g`});
  events.sort((a,b)=>a.t-b.t);
  const last=samples.at(-1), orbit=last.orbit;
  const ideal=stage.map((s,i)=>{
    const before=launchMass-(i>0?stage.slice(0,i).reduce((a,x)=>a+x.prop+x.dry,0):0);
    const fuelUsed=i===2?Math.min(s.prop,s.mdot*Math.min(c.stage3Burn,s.prop/s.mdot)):s.prop;
    return s.ispVac*g0*Math.log(before/(before-fuelUsed));
  });
  return {config:c,stages:stage,payload,launchMass,samples,events,maxQ,maxG,maxAlt,
    idealDV:ideal.reduce((a,x)=>a+x,0),idealPerStage:ideal,orbit,ended:stopped?'impact':'coast',
    cutoff:burnouts,firstStageRatio:launchMass/(launchMass-stage[0].prop),
    thrustAtLiftoff:samples[0].thrust,twAtLiftoff:samples[0].thrust/(launchMass*CONSTANTS.g0)};
}
