import React, { useEffect, useRef, useState } from 'react';
import SolarSystemFallback from './SolarSystemFallback.jsx';
import { BODIES, EARTH_MOON, BODY_LOOKUP, displayRadiusToAU, getOrbitPosition, getMoonPosition } from '../../scientific/cosmicPhysics.js';

// WebGL 1.0 compatible GLSL. The old complex shader could fail on stricter drivers.
// Two hardware shader paths ensure a rendering failure does not needlessly disable 3D.
const sphereVertex=`
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uVP;
uniform vec3 uCenter;
uniform float uRadius;
varying vec3 vNormal;
void main() {
 vNormal = aNormal;
 gl_Position = uVP * vec4(uCenter + aPosition * uRadius, 1.0);
}`;
const sphereFragment=`
precision mediump float;
uniform vec3 uColor;
uniform float uSolar;
varying vec3 vNormal;
void main() {
 vec3 lightDirection = normalize(vec3(-0.5, 0.8, 0.65));
 float diffuse = max(dot(normalize(vNormal), lightDirection), 0.0);
 float lightLevel = mix(0.27 + 0.73 * diffuse, 1.0, uSolar);
 gl_FragColor = vec4(uColor * lightLevel, 1.0);
}`;
const basicSphereVertex=`
attribute vec3 aPosition;
uniform mat4 uVP;
uniform vec3 uCenter;
uniform float uRadius;
void main(){ gl_Position = uVP * vec4(uCenter + aPosition * uRadius, 1.0); }
`;
const basicSphereFragment=`
precision mediump float;
uniform vec3 uColor;
void main(){ gl_FragColor = vec4(uColor, 1.0); }
`;
const flatVertex=`
attribute vec3 aPosition;
uniform mat4 uVP;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uPoint;
void main(){ gl_Position = uVP * vec4(uCenter + aPosition * uRadius, 1.0); gl_PointSize = uPoint; }
`;
const flatFragment=`precision mediump float; uniform vec4 uColor; void main(){gl_FragColor=uColor;}`;
const V=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normal=a=>{const length=Math.hypot(...a)||1;return a.map(x=>x/length);};
const add=(a,b,scale=1)=>a.map((x,i)=>x+b[i]*scale);
function lookAt(eye){
 const z=normal(eye),x=normal(cross([0,1,0],z)),y=cross(z,x);
 return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
}
function perspective(fov,aspect,near,far){
 const f=1/Math.tan(fov/2),nf=1/(near-far);
 return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0];
}
function multiply(a,b){const c=new Array(16).fill(0);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)c[col*4+row]+=a[k*4+row]*b[col*4+k];return c;}
function project(vp,pos,w,h){const a=pos,c=[a.x,a.y,a.z,1],q=[0,0,0,0];for(let row=0;row<4;row++)for(let k=0;k<4;k++)q[row]+=vp[k*4+row]*c[k];if(q[3]<=0)return null;return {x:(q[0]/q[3]+1)*w/2,y:(1-q[1]/q[3])*h/2,depth:q[2]/q[3]};}
function makeProgram(gl,vertex,fragment) {
 const compile=(type,source,label)=>{
  const shader=gl.createShader(type);
  if(!shader)throw Error(`${label}: shader allocation failed`);
  gl.shaderSource(shader,source);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
   const details=gl.getShaderInfoLog(shader)||'unknown shader compilation error';
   gl.deleteShader(shader);
   throw Error(`${label}: ${details}`);
  }
  return shader;
 };
 const v=compile(gl.VERTEX_SHADER,vertex,'vertex');
 let f,prog;
 try {
  f=compile(gl.FRAGMENT_SHADER,fragment,'fragment');
  prog=gl.createProgram();
  if(!prog)throw Error('shader program allocation failed');
  gl.attachShader(prog,v);
  gl.attachShader(prog,f);
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(`shader link: ${gl.getProgramInfoLog(prog)||'unknown error'}`);
  return prog;
 }catch(error){if(prog)gl.deleteProgram(prog);throw error;}
 finally {gl.deleteShader(v);if(f)gl.deleteShader(f);}
}
function buffer(gl,arr){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.STATIC_DRAW);return b;}
function sphereMesh(){const verts=[],normals=[],steps=18,segments=32;
 const point=(t,p)=>[Math.sin(t)*Math.cos(p),Math.cos(t),Math.sin(t)*Math.sin(p)];
 for(let i=0;i<steps;i++)for(let j=0;j<segments;j++){
  const t=i*Math.PI/steps,t2=(i+1)*Math.PI/steps,p=j*2*Math.PI/segments,p2=(j+1)*2*Math.PI/segments;
  const a=point(t,p),b=point(t2,p),c=point(t2,p2),d=point(t,p2);
  for(const v of [a,b,d,b,c,d]){verts.push(...v);normals.push(...v);}
 }return {verts,normals};
}
const hexToRGB=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
function orbitVertices(radius){const verts=[];for(let i=0;i<128;i++){
 const a=i*2*Math.PI/128,b=(i+1)*2*Math.PI/128;
 verts.push(radius*Math.cos(a),0,radius*Math.sin(a),radius*Math.cos(b),0,radius*Math.sin(b));
}return verts;}
function saturnRing(){const verts=[];for(let i=0;i<160;i++){
 const a=i*2*Math.PI/160,b=(i+1)*2*Math.PI/160;
 const p=(r,t)=>[r*Math.cos(t),.03,r*Math.sin(t)];
 verts.push(...p(1.3,a),...p(1.9,a),...p(1.3,b),...p(1.3,b),...p(1.9,a),...p(1.9,b));
}return verts;}
function buildStarField(){let seed=914;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};const arr=[];for(let i=0;i<600;i++){const y=random()*2-1,a=random()*2*Math.PI,r=120;arr.push(r*Math.sqrt(1-y*y)*Math.cos(a),r*y,r*Math.sqrt(1-y*y)*Math.sin(a));}return arr;}

export default function SolarSystemScene({ selected, onSelect, speed, paused, resetToken, onModeChange }){
 const [fallbackReason, setFallbackReason] = useState(null);
 const [attempt, setAttempt] = useState(0);
 const [simpleShader, setSimpleShader] = useState(false);
 const canvasRef=useRef(null), labelsRef=useRef(null), callbackRef=useRef(onSelect),selRef=useRef(selected),speedRef=useRef(speed),pauseRef=useRef(paused);
 useEffect(()=>{callbackRef.current=onSelect;},[onSelect]);
 useEffect(()=>{selRef.current=selected;},[selected]);
 useEffect(()=>{speedRef.current=speed;},[speed]);
 useEffect(()=>{pauseRef.current=paused;},[paused]);
 useEffect(()=>{const canvas=canvasRef.current,labels=labelsRef.current;if(!canvas)return;
  let gl = null;
  try { gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'default' }) || canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl'); } catch (error) { console.warn('SOLARIS WebGL context unavailable:', error); }
  if (!gl) { setFallbackReason('unavailable'); onModeChange?.('2d'); return; }
  const resources=[],programs=[];
  let sphere,flat,useBasic=false;
  try {
   try {sphere=makeProgram(gl,sphereVertex,sphereFragment);}
   catch (primaryError) {
    console.warn('SOLARIS advanced shader failed; retrying basic 3D:',primaryError);
    sphere=makeProgram(gl,basicSphereVertex,basicSphereFragment);
    useBasic=true;
   }
   flat=makeProgram(gl,flatVertex,flatFragment);
   programs.push(sphere,flat);
  }catch(error){
   console.error('SOLARIS all WebGL shader pipelines failed:',error);
   if(sphere)gl.deleteProgram(sphere);
   setFallbackReason('shader');onModeChange?.('2d');return;
  }
  setSimpleShader(useBasic);
  setFallbackReason(null);
  onModeChange?.('3d');
  const addBuffer=arr=>{const b=buffer(gl,arr);resources.push(b);return b;};
  const mesh=sphereMesh(),geometry={v:addBuffer(mesh.verts),n:addBuffer(mesh.normals),count:mesh.verts.length/3};
  const orbits=BODIES.filter(b=>b.orbit>0).map(b=>({buffer:addBuffer(orbitVertices(b.orbit)),count:256}));
  const stars=buildStarField(),starBuffer=addBuffer(stars),ring=addBuffer(saturnRing());
  const uniforms=(program,names)=>Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(program,n)]));
  const sU=uniforms(sphere,['uVP','uCenter','uRadius','uColor','uSolar']),fU=uniforms(flat,['uVP','uCenter','uRadius','uColor','uPoint']);
  let view={yaw:-.7,polar:.91,dist:42},day=0,last=0,raf=0,width=1,height=1,frameMatrix=[],planetPositions={},screenPositions={},pointer=null,dragged=false;
  let visible=true, contextLost=false;
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const frameInterval=1000/(window.matchMedia('(max-width: 740px)').matches?30:48);
  const visibleObserver=typeof IntersectionObserver==='undefined'?{observe(){},disconnect(){}}:new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;}, {threshold:0.02});
  visibleObserver.observe(canvas);
  const onContextLost=e=>{e.preventDefault();contextLost=true;setFallbackReason('lost');onModeChange?.('2d');};
  const onContextRestored=()=>{setAttempt(v=>v+1);};
  canvas.addEventListener('webglcontextlost',onContextLost);
  canvas.addEventListener('webglcontextrestored',onContextRestored);
  const resize=()=>{const r=canvas.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);const dpr=Math.min(window.matchMedia('(max-width: 740px)').matches?1.35:1.7,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);gl.viewport(0,0,canvas.width,canvas.height);};
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();
  const drawFlat=(vertexBuffer,count,mode,color,center=[0,0,0],radius=1,point=1)=>{
   gl.useProgram(flat);gl.uniformMatrix4fv(fU.uVP,false,new Float32Array(frameMatrix));gl.uniform3fv(fU.uCenter,center);gl.uniform1f(fU.uRadius,radius);gl.uniform4fv(fU.uColor,color);gl.uniform1f(fU.uPoint,point);
   gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);const at=gl.getAttribLocation(flat,'aPosition');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,0,0);gl.drawArrays(mode,0,count);gl.disableVertexAttribArray(at);
  };
  const drawSphere=(body,pos)=>{
   gl.useProgram(sphere);gl.uniformMatrix4fv(sU.uVP,false,new Float32Array(frameMatrix));gl.uniform3fv(sU.uCenter,[pos.x,pos.y,pos.z]);gl.uniform1f(sU.uRadius,body.radius);
   gl.uniform3fv(sU.uColor,hexToRGB(body.color));if(sU.uSolar)gl.uniform1f(sU.uSolar,body.id==='sun'?1:0);
   for(const [key,bufferData] of [['aPosition',geometry.v],['aNormal',geometry.n]]){const at=gl.getAttribLocation(sphere,key);if(at<0)continue;gl.bindBuffer(gl.ARRAY_BUFFER,bufferData);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,0,0);}
   gl.drawArrays(gl.TRIANGLES,0,geometry.count);
   for(const name of ['aPosition','aNormal']){const at=gl.getAttribLocation(sphere,name);if(at>=0)gl.disableVertexAttribArray(at);}
  };
  const render=ts=>{
   raf=requestAnimationFrame(render);
   if(contextLost||document.hidden||!visible) { last=ts;return; }
   if(last && ts-last<frameInterval) return;
   const elapsed=Math.min(.1,((ts-last)||0)/1000);last=ts;
   if(!pauseRef.current&&!reduceMotion.matches) day+=elapsed*speedRef.current;
   const eye=[view.dist*Math.sin(view.polar)*Math.cos(view.yaw),view.dist*Math.cos(view.polar),view.dist*Math.sin(view.polar)*Math.sin(view.yaw)];
   frameMatrix=multiply(perspective(Math.PI/3,width/height,.1,360),lookAt(eye));
   gl.clearColor(.019,.047,.085,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
   gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
   drawFlat(starBuffer,stars.length/3,gl.POINTS,[.78,.88,1,.75],[0,0,0],1,1.6);
   orbits.forEach(({buffer,count})=>drawFlat(buffer,count,gl.LINES,[.30,.49,.67,.25]));
   const bodies=[...BODIES,EARTH_MOON];
   for(const b of bodies)planetPositions[b.id]=b.id==='moon'?getMoonPosition(day):getOrbitPosition(b,day);
   // Far-to-near painter ordering with true depth handling for mesh overlaps.
   const ordered=[...bodies].sort((a,b)=>{
     const p=planetPositions[a.id],q=planetPositions[b.id];
     return Math.hypot(eye[0]-q.x,eye[1]-q.y,eye[2]-q.z)-Math.hypot(eye[0]-p.x,eye[1]-p.y,eye[2]-p.z);
   });
   ordered.forEach(b=>{
    const pos=planetPositions[b.id];
    if(b.id==='saturn') {gl.depthMask(false);drawFlat(ring,960,gl.TRIANGLES,[.79,.73,.55,.53],[pos.x,pos.y,pos.z],b.radius);gl.depthMask(true);}
    drawSphere(b,pos);
    const screen=project(frameMatrix,pos,width,height);
    screenPositions[b.id]=screen;
   });
   const cur=selRef.current;
   if(cur?.type==='space' && cur.position){
    const p=cur.position;
    const markerBody={radius:.14,color:'#8ae3ec',id:'marker'};
    drawSphere(markerBody,{x:p.x,y:.12,z:p.z});
   }
   if(labels){for(const el of labels.children){const id=el.dataset.planet;const loc=screenPositions[id];
     if(loc && loc.x>=-30 && loc.x<=width+30 && loc.y>=-30 && loc.y<=height+30){el.style.display='block';el.style.transform=`translate3d(${loc.x+12}px,${loc.y+12}px,0)`;} else {el.style.display='none';}
     el.classList.toggle('is-selected',cur?.type==='body' && cur.id===id);
   }}
  };
  const getScreenXY=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const down=e=>{pointer={...getScreenXY(e),yaw:view.yaw,polar:view.polar};dragged=false;canvas.setPointerCapture(e.pointerId);};
  const move=e=>{if(!pointer)return;const xy=getScreenXY(e),dx=xy.x-pointer.x,dy=xy.y-pointer.y;
   if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;
   if(dragged){view.yaw=pointer.yaw-dx*.006;view.polar=Math.max(.20,Math.min(1.49,pointer.polar+dy*.006));}
  };
  const up=e=>{if(!pointer)return;const xy=getScreenXY(e);pointer=null;if(dragged)return;
   let nearest=null,dmin=Infinity;
   for(const b of [...BODIES,EARTH_MOON]){
     const loc=screenPositions[b.id];if(!loc)continue;
     const d=Math.hypot(xy.x-loc.x,xy.y-loc.y);
     const threshold=b.id==='sun'?38:b.id==='moon'?15:19;
     if(d<threshold && d<dmin){nearest=b;dmin=d;}
   }
   if(nearest){callbackRef.current({type:'body',id:nearest.id});return;}
   // Intersect perspective ray with y=0 ecliptic. Geometric visualization only.
   const eye=[view.dist*Math.sin(view.polar)*Math.cos(view.yaw),view.dist*Math.cos(view.polar),view.dist*Math.sin(view.polar)*Math.sin(view.yaw)];
   const forward=normal(eye.map(v=>-v)),right=normal(cross(forward,[0,1,0])),up=normal(cross(right,forward));
   const fovHalf=Math.tan(Math.PI/6),rx=(2*xy.x/width-1)*width/height*fovHalf,ry=(1-2*xy.y/height)*fovHalf;
   const dir=normal(add(add(forward,right,rx),up,ry));
   if(Math.abs(dir[1])<.0001)return;
   const t=-eye[1]/dir[1];if(t<=0)return;
   const hit=add(eye,dir,t),rawRadius=Math.hypot(hit[0],hit[2]);
   const radius=Math.max(2.8,Math.min(21.8,rawRadius)),k=radius/(rawRadius||1);
   const position={x:hit[0]*k,z:hit[2]*k};
   callbackRef.current({type:'space',id:'space',position,au:displayRadiusToAU(radius)});
  };
  const wheel=e=>{e.preventDefault();view.dist=Math.max(14,Math.min(77,view.dist*Math.exp(e.deltaY*.001)));};
  const keydown=e=>{
   const k=e.key;
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','PageUp','PageDown'].includes(k))return;
   e.preventDefault();
   if(k==='ArrowLeft')view.yaw-=.13;
   if(k==='ArrowRight')view.yaw+=.13;
   if(k==='ArrowUp')view.polar=Math.max(.20,view.polar-.1);
   if(k==='ArrowDown')view.polar=Math.min(1.49,view.polar+.1);
   if(k==='+'||k==='='||k==='PageUp')view.dist=Math.max(14,view.dist*.9);
   if(k==='-'||k==='PageDown')view.dist=Math.min(77,view.dist*1.1);
  };
  const onContext=e=>e.preventDefault();
  canvas.addEventListener('keydown',keydown);
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('contextmenu',onContext);
  raf=requestAnimationFrame(render);
  return ()=>{cancelAnimationFrame(raf);visibleObserver.disconnect();canvas.removeEventListener('webglcontextlost',onContextLost);canvas.removeEventListener('webglcontextrestored',onContextRestored);resizeObserver.disconnect();canvas.removeEventListener('keydown',keydown);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('contextmenu',onContext);for(const b of resources)gl.deleteBuffer(b);for(const p of programs)gl.deleteProgram(p);};
 },[attempt]);
 useEffect(()=>{ /* reset camera is performed by remounting with a key in parent */ },[resetToken]);
 return <div className={`solar-canvas-wrap${fallbackReason ? ' is-2d' : ''}`}><canvas ref={canvasRef} tabIndex={0} aria-label="Interactive three-dimensional schematic Solar System. Drag or use arrow keys to orbit. Scroll, plus or minus to zoom. Click a planet or use location buttons below."/>
   {fallbackReason && <SolarSystemFallback selected={selected} onSelect={onSelect} speed={speed} paused={paused} reason={fallbackReason}/>}
   {fallbackReason && <button type="button" className="solar-retry-3d" onClick={()=>{setFallbackReason(null);setAttempt(v=>v+1);}} aria-label="Retry 3D graphics">Retry 3D</button>}
   {!fallbackReason && simpleShader && <div className="solar-simple-shader">COMPATIBILITY 3D</div>}
   <div className="solar-label-layer" style={fallbackReason ? { display: 'none' } : undefined} ref={labelsRef} aria-hidden="true">{[...BODIES,EARTH_MOON].map(b=><span className="solar-planet-label" data-planet={b.id} key={b.id}>{b.name}</span>)}</div>
   <div className="solar-hint">DRAG TO ORBIT <span>·</span> SCROLL TO ZOOM <span>·</span> CLICK TO SELECT</div>
 </div>;
}
