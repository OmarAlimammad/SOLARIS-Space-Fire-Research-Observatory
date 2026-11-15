import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {simulate,BASE_RATIO,BASE_MASS,CONSTANTS,STAGES,V,orbitElements} from './physics.mjs';

const $=id=>document.getElementById(id);
const fmt=(v,d=1)=>Number.isFinite(v)?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const formatClock=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const unit=(x,y,z)=>new THREE.Vector3(x,y,z).normalize();
const setText=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
const FILE_BASE='assets/SaturnV.glb';
const controlsIds=['ratio','v0','payloadFactor','throttle','cdScale','windEast','pitchStart','pitchEnd','pitchFinal','limitAoA'];
const checkIds=['atmosphere','rotation','j2','lift','targetOrbit'];
const simParameters=()=>Object.fromEntries([...controlsIds.map(k=>[k,Number($(k).value)]),...checkIds.map(k=>[k,$(k).checked])]);
let mission,playTime=0,playing=false,rate=8,lastFrame=0,graphMode='alt',reference=null,camMode='chase';
let previousEventIndex=-1;
const last =()=>mission.samples.at(-1).t;
const mColor={orange:'#f0a56c',blue:'#84c6fb',purple:'#b5a5ee',green:'#70dfbd'};

function applyPreset(preset){
 const presets={
   saturn:{ratio:BASE_RATIO,v0:0,payloadFactor:1,throttle:1,cdScale:1,windEast:0,pitchStart:0,pitchEnd:265,pitchFinal:80,limitAoA:5,atmosphere:true,rotation:true,j2:true,lift:true,targetOrbit:true},
   light:{ratio:BASE_RATIO,v0:0,payloadFactor:.65,throttle:1,cdScale:1,windEast:0,pitchStart:0,pitchEnd:275,pitchFinal:80,limitAoA:5,atmosphere:true,rotation:true,j2:true,lift:true,targetOrbit:true},
   steep:{ratio:BASE_RATIO,v0:0,payloadFactor:1,throttle:1,cdScale:1,windEast:0,pitchStart:15,pitchEnd:560,pitchFinal:88,limitAoA:5,atmosphere:true,rotation:true,j2:true,lift:true,targetOrbit:true}
 };
 const values=presets[preset];for(const [k,v] of Object.entries(values)){
  if(controlsIds.includes(k))$(k).value=k==='ratio'?v.toFixed(3):v;
  else $(k).checked=v;
 }
 document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('on',b.dataset.preset===preset));
}
function notice(message){const el=$('scene-toast');el.textContent=message;el.classList.add('show');el.dataset.expires=String(performance.now()+3800);}
function setButton(){setText('play-btn',playing?'Ⅱ  PAUSE':'▶  LAUNCH / RESUME');setText('replay-status',playing?'PLAYING · LIVE PHYSICS TRAJECTORY':'PAUSED / REPLAY · DRAG TO INSPECT');}
function recalculate(){
 try{
  const c=simParameters();
  mission=simulate(c);
  $('input-error').hidden=true;
  playing=false;playTime=0;previousEventIndex=-1;setButton();
  setText('system-status','NUMERICAL SOLUTION READY');
  setText('calc-dv',`${fmt(mission.idealDV/1000,2)} km/s`);
  setText('calc-twr',`${fmt(mission.twAtLiftoff,3)} : 1`);
  setText('calc-mass',`${fmt(mission.launchMass/1000,1)} t`);
  setText('calc-burn',`${fmt(mission.stages[0].prop/mission.stages[0].mdot,1)} s`);
  $('timeline').max=String(last());$('timeline').value=0;
  setText('timeline-end',`T+${formatClock(last())}`);
  renderEvents();buildGlobePath();updateAt(0);drawChart();
  notice('MISSION RECOMPUTED · 3-DOF / RK4');
 }catch(err){$('input-error').hidden=false;$('input-error').textContent=err.message;console.error(err);}
}
function timeIndex(t){
 const A=mission.samples;let low=0,high=A.length-1;
 while(low<high){const mid=(low+high)>>1;if(A[mid].t<t)low=mid+1;else high=mid;}
 return low;
}
function sampleAt(t){
 if(t<=0)return mission.samples[0]; if(t>=last())return mission.samples.at(-1);
 const i=timeIndex(t),b=mission.samples[i],a=mission.samples[i-1];
 const frac=clamp((t-a.t)/Math.max(1e-9,b.t-a.t),0,1);
 const s={...a};
 for(const k of ['alt','speed','radialSpeed','horizontalSpeed','q','M','gLoad','thrust','m','aoa','Cd','drag','lift','heat','rho','temperature','pressure','grav','range','pitch'])s[k]=a[k]+(b[k]-a[k])*frac;
 s.r=a.r.map((v,j)=>v+(b.r[j]-v)*frac);s.v=a.v.map((v,j)=>v+(b.v[j]-v)*frac);
 s.t=t;s.orbit=orbitElements([...s.r,...s.v,s.m]);
 // At discrete staging boundaries do not interpolate across mass jumps.
 if(a.t===b.t || a.stage!==b.stage || a.engine!==b.engine){return frac>=.5?b:a;}
 return s;
}
function stageFuel(s){
 if(s.stage>2)return mission.stages[2].prop>0?
    clamp((s.m-mission.payload-mission.stages[2].dry)/mission.stages[2].prop,0,1):0;
 const stage=mission.stages[s.stage];
 const future=mission.stages.slice(s.stage+1).reduce((acc,st)=>acc+st.dry+st.prop,0);
 return clamp((s.m-mission.payload-future-stage.dry)/stage.prop,0,1);
}
function updateAt(t){
 if(!mission)return;
 playTime=clamp(t,0,last());$('timeline').value=String(playTime);
 const s=sampleAt(playTime);
 const phase=s.stage>2?'COAST':mission.stages[s.stage].name;
 const stageLabel=s.stage>2?'S-IVB / COAST':`${phase} / STAGE ${s.stage+1}`;
 setText('big-alt',`${fmt(s.alt/1000,1)} km`);
 $('big-alt').innerHTML=`${fmt(s.alt/1000,1)} <i>km</i>`;
 setText('hud-clock',formatClock(playTime));setText('hud-speed',`${fmt(s.speed,0)} m/s`);
 setText('mission-clock',`T+ ${formatClock(playTime)}.${Math.floor((playTime%1)*10)}`);
 setText('clock-phase',phase+(s.engine?' · BURN':' · BALLISTIC'));
 const flightStatus=playTime===0?'● READY FOR IGNITION':s.stage>2?(s.orbit.orbital?'● ORBIT INSERTION':'● COASTING'):`● ${phase} ENGINE ON`;
 setText('flight-status',flightStatus);
 setText('stage-label',stageLabel);
 [0,1,2].forEach(i=>{const p=$('st'+i);p.classList.toggle('active',i===Math.min(s.stage,2));p.classList.toggle('done',i<s.stage);});
 setText('engine-state',s.engine?mission.stages[s.stage].engine+' / ACTIVE':'ENGINE CUTOFF');
 const fuel=stageFuel(s);setText('fuel-number',`${fmt(fuel*100,1)}%`);$('fuel-meter').style.width=`${100*fuel}%`;
 setText('metric-g',`${fmt(s.gLoad,2)} g`);$('metric-g').innerHTML=`${fmt(s.gLoad,2)} <small>g</small>`;
 $('metric-q').innerHTML=`${fmt(s.q/1000,2)} <small>kPa</small>`;
 $('metric-mach').innerHTML=`${fmt(s.M,2)} <small>Ma</small>`;
 $('metric-mass').innerHTML=`${fmt(s.m/1000,1)} <small>t</small>`;
 const atmvel = s.speed; // inertial speed; local ground range and radial are separately shown.
 setText('t-groundspeed',`${fmt(s.horizontalSpeed,0)} m/s (inertial tang.)`);
 setText('t-vertical',`${s.radialSpeed<0?'−':'+'}${fmt(Math.abs(s.radialSpeed),0)} m/s`);
 setText('t-range',`${fmt(s.range/1000,1)} km`);
 setText('t-thrust',`${fmt(s.thrust/1e6,3)} MN`);
 setText('t-drag',`${fmt(s.drag/1000,1)} kN`);
 setText('t-aoa',`${fmt(s.aoa,2)}°`);
 setText('t-cd',`${fmt(s.Cd,3)}`);
 setText('t-heat',`${fmt(s.heat/1000,1)} kW/m²`);
 setText('t-rho',`${s.rho<.001?s.rho.toExponential(2):fmt(s.rho,4)} kg/m³`);
 setText('t-pressure',`${s.pressure<1?s.pressure.toExponential(2):fmt(s.pressure/1000,2)+' kPa'}`);
 setText('t-temp',`${fmt(s.temperature-273.15,1)} °C`);
 setText('t-gravity',`${fmt(s.grav,4)} m/s²`);
 const orbit=s.orbit;
 setText('t-perigee',orbit.perigee===null?'UNBOUND':`${fmt(orbit.perigee/1000,0)} km`);
 setText('t-apogee',orbit.apogee===null?'UNBOUND':`${fmt(orbit.apogee/1000,0)} km`);
 setText('t-ecc',fmt(orbit.eccentricity,4));setText('t-inc',`${fmt(orbit.inclination,2)}°`);
 setText('orbit-caption',orbit.orbital?'✓ Perigey >120 km · şərti atmosferdən kənar orbit':'Yer səthinin altındakı perigey sabit orbit deyil.');
 updateScene(s);
 updateEventsHighlight();
}
function renderEvents(){
 const l=$('event-list');l.replaceChildren();setText('event-count',mission.events.length);
 mission.events.forEach((e,i)=>{
   const div=document.createElement('div');div.className='event';div.dataset.eventIndex=String(i);
   const time=document.createElement('span');time.className='event-time';time.textContent=`T+${formatClock(e.t)}`;
   const label=document.createElement('span');label.className='event-name';label.textContent=e.text;
   div.append(time,label);div.addEventListener('click',()=>{playing=false;setButton();updateAt(e.t);drawChart();});l.append(div);
 });
}
function updateEventsHighlight(){
 let i=0;mission.events.forEach((e,j)=>{if(e.t<=playTime+0.01)i=j;});
 if(i!==previousEventIndex){
  previousEventIndex=i;
  $('event-list').querySelectorAll('.event').forEach((el,j)=>el.classList.toggle('active',j===i));
  if(playing && i>0)notice(mission.events[i].text);
 }
}
const chartFields={
 alt:{key:'alt',mult:.001,label:'ALTITUDE',unit:'km',color:mColor.orange},
 speed:{key:'speed',mult:.001,label:'INERTIAL VELOCITY',unit:'km/s',color:mColor.blue},
 q:{key:'q',mult:.001,label:'DYNAMIC PRESSURE',unit:'kPa',color:mColor.purple},
 g:{key:'gLoad',mult:1,label:'PROPER ACCELERATION',unit:'g',color:mColor.green}
};
function chartData(run,key){return run.samples.map(x=>({t:x.t,y:x[chartFields[key].key]*chartFields[key].mult}));}
function drawChart(){
 const canvas=$('flight-chart');const rect=canvas.getBoundingClientRect();if(rect.width<5)return;
 const dpi=Math.min(2,devicePixelRatio||1);
 canvas.width=Math.round(rect.width*dpi);canvas.height=Math.round(rect.height*dpi);
 const ctx=canvas.getContext('2d');ctx.scale(dpi,dpi);
 const w=rect.width,h=rect.height,pad={l:55,r:12,t:14,b:22};
 const f=chartFields[graphMode],data=chartData(mission,graphMode), ref=reference?chartData(reference,graphMode):null;
 const xmin=0,xmax=Math.max(last(),reference?reference.samples.at(-1).t:0);
 const all=data.concat(ref??[]);
 const ymax=Math.max(1,Math.max(...all.map(x=>x.y))*1.12);
 const ymin=Math.min(0,Math.min(...all.map(x=>x.y)));
 const px=x=>pad.l+(x-xmin)/(xmax-xmin)*(w-pad.l-pad.r), py=y=>pad.t+(1-(y-ymin)/Math.max(1e-8,ymax-ymin))*(h-pad.t-pad.b);
 ctx.font='10px DM Mono,monospace';ctx.textBaseline='middle';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const y=pad.t+(h-pad.t-pad.b)*i/4;ctx.strokeStyle='#304256';ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle='#738aa1';ctx.textAlign='right';ctx.fillText(fmt(ymax-(ymax-ymin)*i/4,1),pad.l-8,y);}
 for(let i=0;i<=5;i++){const t=xmax*i/5,x=px(t);ctx.strokeStyle='#26384a';ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,h-pad.b);ctx.stroke();ctx.fillStyle='#8192a6';ctx.textAlign='center';ctx.fillText(`${Math.round(t)}s`,x,h-9);}
 const line=(d,color,alpha=1,width=1.6)=>{ctx.beginPath();ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=width;for(let i=0;i<d.length;i++){const x=px(d[i].t),y=py(d[i].y);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.globalAlpha=1;};
 if(ref)line(ref,'#b1cce0',.65,1.1);
 const gradient=ctx.createLinearGradient(0,pad.t,0,h-pad.b);gradient.addColorStop(0,'#df976b22');gradient.addColorStop(1,'#df976b00');
 ctx.beginPath();data.forEach((d,i)=>{if(i===0)ctx.moveTo(px(d.t),py(d.y));else ctx.lineTo(px(d.t),py(d.y))});ctx.lineTo(px(data.at(-1).t),py(0));ctx.lineTo(px(0),py(0));ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
 line(data,f.color,1,2.0);
 const current=sampleAt(playTime),mx=px(playTime),my=py(current[f.key]*f.mult);
 ctx.save();ctx.strokeStyle='#dbecff66';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(mx,pad.t);ctx.lineTo(mx,h-pad.b);ctx.stroke();ctx.restore();
 ctx.fillStyle=f.color;ctx.beginPath();ctx.arc(mx,my,4,0,Math.PI*2);ctx.fill();
 ctx.font='9px DM Mono,monospace';ctx.textAlign='left';ctx.fillStyle='#91a6bb';ctx.fillText(`${f.label} [${f.unit}]`,pad.l+8,pad.t+5);
}
function download(content,name,type){const blob=new Blob([content],{type});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
const csvKeys=['t','alt','speed','radialSpeed','horizontalSpeed','m','thrust','q','M','gLoad','stage','engine','aoa','Cd','drag','lift','heat','rho','pressure','temperature','grav','range','pitch'];
function saveCsv(){const lines=[csvKeys.join(',')];for(const s of mission.samples)lines.push(csvKeys.map(k=>typeof s[k]==='boolean'?(s[k]?1:0):s[k]).join(','));download(lines.join('\r\n'),'SaturnV_Flight_Results.csv','text/csv;charset=utf-8');}
function saveJson(){download(JSON.stringify({metadata:{name:'Orbital Lab V2',units:'SI',model:'3-DOF / point mass / approximate aerodynamics',created:new Date().toISOString()},config:mission.config,stages:mission.stages,idealDV:mission.idealDV,events:mission.events,summary:{maxQ:mission.maxQ,maxG:mission.maxG,maxAlt:mission.maxAlt,orbit:mission.orbit},samples:mission.samples},null,2),'SaturnV_Research_Results.json','application/json');}

// ------------------ REAL-TIME THREE.JS PRESENTATION (DISPLAY SCALE NONPHYSICAL) ------------------
const scene=new THREE.Scene();scene.background=new THREE.Color(0x0c1d30);scene.fog=new THREE.FogExp2(0x0b1927,.0007);
const camera=new THREE.PerspectiveCamera(49,1,.1,100000);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
$('scene-container').append(renderer.domElement);
const orbitCtrl=new OrbitControls(camera,renderer.domElement);orbitCtrl.enableDamping=true;orbitCtrl.dampingFactor=.09;
orbitCtrl.minDistance=5;orbitCtrl.maxDistance=700;
const hemi=new THREE.HemisphereLight(0x9ecdf0,0x161b22,1.65);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffe0b7,3.1);sun.position.set(50,110,35);scene.add(sun);
const rim=new THREE.DirectionalLight(0x68bbff,1.6);rim.position.set(-30,25,-18);scene.add(rim);
const globeGroup=new THREE.Group(),localGroup=new THREE.Group();scene.add(globeGroup,localGroup);
const rocketVisual=new THREE.Group();localGroup.add(rocketVisual);
const fullRocket=new THREE.Group(),upperRocket=new THREE.Group(),thirdRocket=new THREE.Group();rocketVisual.add(fullRocket,upperRocket,thirdRocket);
const tempVec=new THREE.Vector3();
const white=new THREE.MeshStandardMaterial({color:0xe9edf1,roughness:.42,metalness:.32});
const dark=new THREE.MeshStandardMaterial({color:0x1b2128,roughness:.66,metalness:.13});
const silver=new THREE.MeshStandardMaterial({color:0xbac8d4,metalness:.73,roughness:.27});
const orange=new THREE.MeshStandardMaterial({color:0xe8a378,metalness:.35,roughness:.46});
function cyl(parent,rTop,rBottom,len,y,material,seg=24){const o=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,len,seg),material);o.position.y=y;parent.add(o);return o;}
function box(parent,w,h,d,x,y,z,material){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);o.position.set(x,y,z);parent.add(o);return o;}
function stageAssembly(parent,stageNumber){
 const full=stageNumber===0;let base=0;
 const dims=stageNumber===0?[[1,5.2],[1,3.2],[.83,2.1],[.36,2.2]]:stageNumber===1?[[1,3.2],[.83,2.1],[.36,2.2]]:[ [.83,2.1],[.36,2.2] ];
 dims.forEach(([rad,len],i)=>{cyl(parent,rad,rad,len,base+len/2,i%2?white:white);cyl(parent,rad*1.015,rad*1.015,.32,base+.6, dark);
  if(i===0||i===1){cyl(parent,rad*1.02,rad*1.02,.18,base+len-.24,dark);cyl(parent,rad*1.015,rad*1.015,.18,base+len-.5,silver);}
  base+=len;
 });
 cyl(parent,.31,0,1.4,base+.75,white);
 let engineCount=stageNumber===0?5:stageNumber===1?5:1;
 for(let i=0;i<engineCount;i++){
  const a=i*2*Math.PI/4,r=engineCount===1?0:.49;
  const nozzle=cyl(parent,.17,.27,.45,-.25,dark,20);nozzle.position.x=Math.sin(a)*r;nozzle.position.z=Math.cos(a)*r;
 }
 // stripes and dark fins: conspicuous silhouette at different stages
 if(stageNumber===0){for(let j=0;j<4;j++){let a=j*Math.PI/2;box(parent,.28,.8,.15,Math.sin(a)*.92,1.0,Math.cos(a)*.92,dark);}}
}
stageAssembly(fullRocket,0);stageAssembly(upperRocket,1);stageAssembly(thirdRocket,2);
upperRocket.position.y=5.2;thirdRocket.position.y=8.4;
// In the imported GLB the geometry itself is one visual asset; detached pieces are
// deliberately reconstructed as simple cylinders and are not re-used collision meshes.
const debris=[];
for(let i=0;i<2;i++){
 const piece=new THREE.Group();const height=i===0?5.2:3.2;
 cyl(piece,1,1,height,height/2,white,28);
 cyl(piece,1.01,1.01,.26,.8,dark,28);
 cyl(piece,.55,.75,.6,-.33,dark);
 piece.visible=false;localGroup.add(piece);debris.push(piece);
}

const flameRoot=new THREE.Group();rocketVisual.add(flameRoot);
const coneMat=new THREE.MeshBasicMaterial({color:0xfeb268,transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
const coreMat=new THREE.MeshBasicMaterial({color:0xc3e9ff,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending});
const flames=[];
for(let i=0;i<5;i++){
 const p=new THREE.Group(),a=i*Math.PI/2;
 p.position.set(i===0?0:Math.sin(a)*.53,-.40,i===0?0:Math.cos(a)*.53);
 const f=new THREE.Mesh(new THREE.ConeGeometry(i===0?.29:.21,4.9,14,1,true),coneMat);
 f.rotation.z=Math.PI;f.position.y=-2.5;
 const f2=new THREE.Mesh(new THREE.ConeGeometry(i===0?.14:.12,3.1,12,1,true),coreMat);f2.rotation.z=Math.PI;f2.position.y=-1.65;
 p.add(f,f2);flameRoot.add(p);flames.push({p,f,f2});
}
// Ground: local-only launch infrastructure.
const groundMat=new THREE.MeshStandardMaterial({color:0x24332e,roughness:1});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(12000,12000,1,1),groundMat);ground.rotation.x=-Math.PI/2;ground.position.y=-1.15;localGroup.add(ground);
const platform=box(localGroup,16,1.2,14,1,-.48,-1,dark);
for(let i=0;i<3;i++){box(localGroup,16,.12,.26,1,.20,-7+i*7,silver);}
const tower=new THREE.Group();tower.position.set(7,0,-1);localGroup.add(tower);
for(const x of [-2.4,2.4])for(const z of [-1.5,1.5])box(tower,.32,23,.3,x,11.5,z,silver);
for(let i=0;i<14;i++){let y=1+i*1.6;box(tower,5.4,.13,3.2,0,y,0,dark);if(i%2===0){const diag=box(tower,.11,2.2,.1,0,y,0,orange);diag.rotation.z=.38;}}
for(let i=0;i<5;i++){const y=4+i*3.6;box(tower,5.0,.17,.15,-4.75,y,0,silver);box(tower,.18,.17,.18,-2.7,y,0,orange);}
const padLights=[];
for(const x of [-14,16])for(const z of [-11,12]){const lamp=new THREE.PointLight(0xffc08b,17,45);lamp.position.set(x,5.8,z);localGroup.add(lamp);padLights.push(lamp);box(localGroup,.15,6,.15,x,2,z,silver);}
// Clouds as blended translucent formations.
const cloudMaterial=new THREE.MeshLambertMaterial({color:0xc1d9df,transparent:true,opacity:.15,depthWrite:false});
const clouds=new THREE.Group();localGroup.add(clouds);
let seed=371;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<46;i++){const p=new THREE.Group();p.position.set((rand()-.5)*270,11+rand()*35,(rand()-.5)*270);
 for(let j=0;j<4;j++){const puff=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),cloudMaterial);puff.scale.set(8+rand()*14,1.6+rand()*3.6,5+rand()*7);puff.position.set((rand()-.5)*10,(rand()-.5)*3,(rand()-.5)*5);p.add(puff);}clouds.add(p);}
// Stars and Earth globe, client-side procedural textures (no network assets required).
const starPositions=[];for(let i=0;i<1550;i++){const a=rand()*Math.PI*2,z=rand()*2-1,r=Math.sqrt(1-z*z)*800;starPositions.push(Math.cos(a)*r,Math.sin(a)*r,z*800);}
const starGeom=new THREE.BufferGeometry();starGeom.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
const starField=new THREE.Points(starGeom,new THREE.PointsMaterial({color:0xdce9ff,size:1.65,sizeAttenuation:false,transparent:true,opacity:.92,depthWrite:false}));scene.add(starField);
function earthTexture(){
 const cv=document.createElement('canvas');cv.width=1024;cv.height=512;const g=cv.getContext('2d');
 const grad=g.createLinearGradient(0,0,0,512);grad.addColorStop(0,'#183958');grad.addColorStop(.5,'#15456c');grad.addColorStop(1,'#092840');g.fillStyle=grad;g.fillRect(0,0,1024,512);
 // Stylized coastline approximation; the surface is VISUAL, not geographic data.
 const shapes=[
 [[100,90],[200,70],[246,115],[230,162],[190,172],[166,234],[130,222],[128,156],[110,160]],
 [[234,224],[278,214],[311,249],[302,310],[281,350],[262,414],[242,378],[224,317]],
 [[448,107],[530,91],[578,117],[648,91],[728,121],[750,167],[696,192],[686,229],[628,211],[585,236],[536,206],[470,194]],
 [[474,207],[553,211],[583,267],[559,332],[520,379],[478,349],[448,291]],
 [[750,305],[820,302],[854,346],[823,387],[757,371]],
 [[870,117],[912,119],[933,160],[911,168],[894,150]],
 [[302,90],[335,67],[357,80],[340,111]],
 ];
 shapes.forEach(poly=>{g.beginPath();poly.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle='#59775c';g.fill();g.strokeStyle='#87956d';g.lineWidth=3;g.stroke();});
 // Subtle terrain shading and a cloud layer in the same low-cost procedural canvas.
 for(let i=0;i<240;i++){const x=rand()*1024,y=rand()*512;g.fillStyle=`rgba(255,255,255,${rand()*.075})`;g.beginPath();g.ellipse(x,y,2+rand()*17,.5+rand()*4,rand()*Math.PI,0,Math.PI*2);g.fill();}
 return new THREE.CanvasTexture(cv);
}
const earthMat=new THREE.MeshStandardMaterial({map:earthTexture(),roughness:.88,metalness:.05});
const earth=new THREE.Mesh(new THREE.SphereGeometry(90,96,64),earthMat);globeGroup.add(earth);
const atmosphereGlow=new THREE.Mesh(new THREE.SphereGeometry(92.3,64,48),new THREE.ShaderMaterial({
 transparent:true,depthWrite:false,side:THREE.BackSide,
 uniforms:{glowColor:{value:new THREE.Color(0x549deb)}},
 vertexShader:'varying vec3 vNormal; varying vec3 vWorldPosition; void main(){vNormal=normalize(normalMatrix*normal); vec4 world=modelMatrix*vec4(position,1.0);vWorldPosition=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}',
 fragmentShader:'uniform vec3 glowColor; varying vec3 vNormal; varying vec3 vWorldPosition;void main(){vec3 viewDir=normalize(cameraPosition-vWorldPosition);float intensity=pow(1.0-abs(dot(normalize(vNormal),viewDir)),2.5);gl_FragColor=vec4(glowColor,intensity*.48);}'
}));globeGroup.add(atmosphereGlow);
const orbitRing=new THREE.Mesh(new THREE.TorusGeometry(90.5,.065,8,140),new THREE.MeshBasicMaterial({color:0x62b3e1,transparent:true,opacity:.15}));orbitRing.rotation.x=Math.PI/2;globeGroup.add(orbitRing);
let pathLine=null;
function toGlobeECI(s){
 const w=mission?.config.rotation?CONSTANTS.omega*s.t:0,co=Math.cos(w),si=Math.sin(w);
 const x=co*s.r[0]+si*s.r[1],e=-si*s.r[0]+co*s.r[1],z=s.r[2];
 return new THREE.Vector3(x,z,e).multiplyScalar(90/CONSTANTS.Re);
}
function buildGlobePath(){
 if(pathLine){globeGroup.remove(pathLine);pathLine.geometry.dispose();pathLine.material.dispose();}
 const stride=Math.max(1,Math.round(mission.samples.length/2300)), pts=[];
 for(let i=0;i<mission.samples.length;i+=stride)pts.push(toGlobeECI(mission.samples[i]));
 const geometry=new THREE.BufferGeometry().setFromPoints(pts);
 pathLine=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xffb36c,transparent:true,opacity:.9}));globeGroup.add(pathLine);
}
// Smoke and lights: visual-only particles.
const smoke=[];let smokeTime=0;
const puffGeo=new THREE.SphereGeometry(1,10,9);
const smokeMat=new THREE.MeshStandardMaterial({color:0xc7c3bd,transparent:true,opacity:.28,depthWrite:false,roughness:1});
for(let i=0;i<75;i++){
 const p=new THREE.Mesh(puffGeo,smokeMat.clone());p.visible=false;localGroup.add(p);smoke.push({mesh:p,born:-100,pos:new THREE.Vector3(),vel:new THREE.Vector3()});
}
function updateSmoke(s,dt){
 if(camMode==='globe'){smoke.forEach(x=>x.mesh.visible=false);return;}
 const burn=s.engine && s.alt<16000;
 smokeTime+=dt;
 if(burn && smokeTime>.035){
  smokeTime=0;const p=smoke[Math.floor(s.t*24)%smoke.length];p.born=playTime;p.pos.copy(rocketVisual.position).add(new THREE.Vector3((rand()-.5)*2,-2.2,(rand()-.5)*2));
  p.vel.set((rand()-.5)*2,-1.8-rand()*2,(rand()-.5)*2);p.mesh.visible=true;
 }
 smoke.forEach(p=>{if(p.born<0)return;const age=Math.max(0,playTime-p.born);
  if(age>12 || age<0){p.mesh.visible=false;return;}
  p.mesh.visible=true;p.mesh.position.copy(p.pos).addScaledVector(p.vel,Math.min(age,6));const z=1+age*.75;p.mesh.scale.set(z,z*.48,z);p.mesh.material.opacity=.27*(1-age/12);
 });
}
let modelLoaded=false;
new GLTFLoader().load(FILE_BASE,gltf=>{
 const model=gltf.scene;
 const bb=new THREE.Box3().setFromObject(model),size=new THREE.Vector3();bb.getSize(size);
 const cx=(bb.min.x+bb.max.x)/2,cz=(bb.min.z+bb.max.z)/2;
 model.position.set(-cx,-bb.min.y,-cz);
 const scale=13.0/Math.max(size.y,.1);model.scale.setScalar(scale);
 model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
 fullRocket.clear();fullRocket.add(model);modelLoaded=true;
 setText('system-status','SATURN V GLB MODEL LOADED');
},undefined,error=>{console.warn('GLB fallback enabled',error);setText('system-status','PROCEDURAL MODEL / FALLBACK');});
function switchCamera(mode){
 camMode=mode;
 const globe=mode==='globe';globeGroup.visible=globe;localGroup.visible=!globe;
 (globe?globeGroup:localGroup).add(rocketVisual);
 rocketVisual.scale.setScalar(globe?.17:1.0);
 document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('selected',b.dataset.camera===mode));
 setText('scene-camera-name',globe?'EARTH / ORBIT':mode==='pad'?'LAUNCH PAD CAMERA':'CHASE CAMERA');
 if(globe){camera.position.set(60,150,250);orbitCtrl.target.set(0,0,0);orbitCtrl.minDistance=98;orbitCtrl.maxDistance=590;}
 else if(mode==='pad'){camera.position.set(27,18,55);orbitCtrl.target.set(0,9,0);orbitCtrl.minDistance=8;orbitCtrl.maxDistance=450;}
 else{camera.position.set(25,19,43);orbitCtrl.target.set(0,6,0);orbitCtrl.minDistance=8;orbitCtrl.maxDistance=200;}
 orbitCtrl.update();
 if(mission)updateScene(sampleAt(playTime));
}
function updateScene(s){
 const globe=camMode==='globe';
 if(globe){rocketVisual.position.copy(toGlobeECI(s));rocketVisual.rotation.set(0,0,0);
  const up=rocketVisual.position.clone().normalize();
  // Align mesh +Y with radial/up direction for an educational globe view.
  const dir=new THREE.Vector3(s.v[0],s.v[2],s.v[1]).normalize();
  const desired=dir.clone().lerp(up,.13).normalize();
  rocketVisual.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),desired);
 }else{
  rocketVisual.position.set((s.range/1000)*.022,1.2+s.alt*.00029,0);
  rocketVisual.rotation.set(0,0,-s.pitch*Math.PI/180);
 }
 fullRocket.visible=s.stage===0;upperRocket.visible=s.stage===1;thirdRocket.visible=s.stage>=2;
 flameRoot.visible=s.engine;
 flames.forEach((x,i)=>{
  x.p.visible=(s.stage===0 || i===0);
  const v=1+Math.sin(s.t*17+i*3)*.14;
  x.p.scale.set(v,clamp((s.thrust/3.38e7)*3.5,.55,2.2)*v,v);
 });
 if(!globe){
  const alt=s.alt;const space=clamp((alt-30000)/85000,0,1);
  scene.background=new THREE.Color(0x103552).lerp(new THREE.Color(0x030812),space);
  ground.visible=alt<175000;platform.visible=alt<85000;tower.visible=alt<85000;padLights.forEach(p=>p.visible=alt<85000);
  clouds.visible=alt<60000;
  const darkSpace=clamp((alt-7000)/80000,0,1);
  starField.material.opacity=.22+darkSpace*.78;
 }else{
  scene.background.set(0x02060e);starField.material.opacity=.95;
 }
}
function tickScene(dt){
 if(!mission)return;
 const s=sampleAt(playTime);
 if(camMode==='chase'){
  const tar=rocketVisual.position.clone().add(new THREE.Vector3(0,5,0));
  const delta=tar.clone().sub(orbitCtrl.target);
  camera.position.addScaledVector(delta,Math.min(1,dt*1.2));orbitCtrl.target.lerp(tar,Math.min(1,dt*1.2));
 }
 orbitCtrl.update();
 if(camMode!=='globe')updateSmoke(s,playing?dt*rate:0);
 if(flameRoot.visible){coneMat.opacity=.78+Math.sin(performance.now()*.024)*.13;coreMat.opacity=.86+Math.sin(performance.now()*.041)*.08;}
 renderer.render(scene,camera);
}
function resize(){const r=$('scene-container').getBoundingClientRect();if(!r.width||!r.height)return;
 renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();drawChart();}
const ro=new ResizeObserver(resize);ro.observe($('scene-container'));ro.observe($('flight-chart'));
function frame(time){requestAnimationFrame(frame);
 const dt=Math.min(.06,Math.max(0,(time-lastFrame)/1000||0));lastFrame=time;
 if(playing && mission){const old=playTime;playTime=Math.min(last(),playTime+dt*rate);
  if(playTime>=last()){playing=false;setButton();notice('REPLAY COMPLETE');}
  updateAt(playTime);
  if(Math.floor(old*2)!==Math.floor(playTime*2))drawChart();
 }
 if($('scene-toast').classList.contains('show') && Number($('scene-toast').dataset.expires)<time)$('scene-toast').classList.remove('show');
 tickScene(dt);
}
requestAnimationFrame(frame);
// ------------------ CONTROLS ------------------
$('calculate-btn').addEventListener('click',recalculate);
$('play-btn').addEventListener('click',()=>{if(playTime>=last())updateAt(0);playing=!playing;setButton();notice(playing?'LAUNCH SEQUENCE ACTIVE':'MISSION PAUSED');});
$('reset-btn').addEventListener('click',()=>{playing=false;updateAt(0);setButton();drawChart();});
$('timeline').addEventListener('input',e=>{playing=false;updateAt(Number(e.target.value));drawChart();setButton();});
$('speed-btn').addEventListener('click',()=>{rate=rate===1?4:rate===4?8:rate===8?16:rate===16?32:1;setText('speed-btn',`${rate}× SPEED`);});
$('compare-btn').addEventListener('click',()=>{reference=reference?null:mission;setText('compare-btn',reference?'⊖ CLEAR REF':'⊕ COMPARE');drawChart();notice(reference?'REFERENCE PROFILE PINNED':'REFERENCE PROFILE REMOVED');});
$('previous-event').addEventListener('click',()=>{const arr=mission.events.filter(x=>x.t<playTime-.5);playing=false;updateAt(arr.at(-1)?.t??0);setButton();drawChart();});
$('next-event').addEventListener('click',()=>{const arr=mission.events.filter(x=>x.t>playTime+.5);playing=false;updateAt(arr[0]?.t??last());setButton();drawChart();});
$('csv-btn').addEventListener('click',saveCsv);$('json-btn').addEventListener('click',saveJson);
$('screenshot-btn').addEventListener('click',()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='SaturnV_Mission_3D.png';a.href=renderer.domElement.toDataURL('image/png');a.click();});
$('help-btn').addEventListener('click',()=>$('model-dialog').showModal());
$('close-dialog').addEventListener('click',()=>$('model-dialog').close());$('dialog-ok').addEventListener('click',()=>$('model-dialog').close());
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{applyPreset(b.dataset.preset);recalculate();}));
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>switchCamera(b.dataset.camera)));
document.querySelectorAll('[data-chart]').forEach(b=>b.addEventListener('click',()=>{graphMode=b.dataset.chart;document.querySelectorAll('[data-chart]').forEach(x=>x.classList.toggle('selected',x===b));drawChart();}));
window.addEventListener('keydown',e=>{if(e.target.closest('input,dialog,button'))return;
 if(e.code==='Space'){e.preventDefault();$('play-btn').click();}if(e.code==='KeyR')$('reset-btn').click();});
applyPreset('saturn');switchCamera('chase');recalculate();resize();
