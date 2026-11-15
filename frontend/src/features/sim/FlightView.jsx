import React, { useEffect, useMemo, useRef, useState } from 'react';
/** Trajectory view (from SOLARIS 5.0): three.js replay of the propagated states, with a 2-D projection fallback. Restyled for SOLARIS. */
import { fmt } from './ui.jsx';

const BODY_COLOR = { earth: '#3f7fd0', moon: '#b9b4ab', sun: '#ffd27a', mars: '#c86a45', venus: '#d9c48f', mercury: '#9c8f85' };
const webglAvailable = () => { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; } };
const bodyAt = (b, i) => { if (!b.path) return [0, 0, 0]; let k = 0; const ix = b.pathIndex; while (k < ix.length - 1 && ix[k + 1] <= i) k++; return [b.path[3 * k], b.path[3 * k + 1], b.path[3 * k + 2]]; };

/** 2-D fallback: orthographic projection of the same propagated track onto its mean orbital plane. */
function View2D({ view, index, zoomOn }) {
  const ref = useRef(null), wrap = useRef(null), [size, setSize] = useState([600, 400]);
  useEffect(() => { const el = wrap.current; const fit = () => setSize([el.clientWidth, el.clientHeight]); fit(); if (!('ResizeObserver' in window)) return; const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect(); }, []);
  const basis = useMemo(() => {
    const t = view.track, n = [0, 0, 0], N = t.length / 3, step = Math.max(1, Math.floor(N / 400));
    for (let i = 0; i + step < N; i += step) { const a = 3 * i, b = 3 * (i + step); n[0] += t[a + 1] * t[b + 2] - t[a + 2] * t[b + 1]; n[1] += t[a + 2] * t[b] - t[a] * t[b + 2]; n[2] += t[a] * t[b + 1] - t[a + 1] * t[b]; }
    let m = Math.hypot(...n); const nn = m > 0 ? n.map(x => x / m) : [0, 0, 1];
    let e1 = [t[0], t[1], t[2]]; const d = e1[0] * nn[0] + e1[1] * nn[1] + e1[2] * nn[2]; e1 = e1.map((x, k) => x - d * nn[k]); m = Math.hypot(...e1) || 1; e1 = e1.map(x => x / m);
    const e2 = [nn[1] * e1[2] - nn[2] * e1[1], nn[2] * e1[0] - nn[0] * e1[2], nn[0] * e1[1] - nn[1] * e1[0]];
    return { e1, e2 };
  }, [view]);
  useEffect(() => {
    const c = ref.current, g = c?.getContext('2d'); if (!g) return; const [w, h] = size, dpr = Math.min(2, window.devicePixelRatio || 1); c.width = w * dpr; c.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { e1, e2 } = basis, t = view.track, N = t.length / 3, P = (x, y, z) => [x * e1[0] + y * e1[1] + z * e1[2], x * e2[0] + y * e2[1] + z * e2[2]];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; const inc = (p, r = 0) => { x0 = Math.min(x0, p[0] - r); x1 = Math.max(x1, p[0] + r); y0 = Math.min(y0, p[1] - r); y1 = Math.max(y1, p[1] + r); };
    const cur = P(t[3 * index], t[3 * index + 1], t[3 * index + 2]);
    if (zoomOn) { const lo = Math.max(0, index - 150), hi = Math.min(N - 1, index + 150); for (let i = lo; i <= hi; i++) inc(P(t[3 * i], t[3 * i + 1], t[3 * i + 2])); }
    else { for (let i = 0; i < N; i++) inc(P(t[3 * i], t[3 * i + 1], t[3 * i + 2])); for (const b of view.bodies) if (!b.path) inc([0, 0], b.radius); else for (let k = 0; k < b.path.length; k += 3) inc(P(b.path[k], b.path[k + 1], b.path[k + 2])); }
    const span = Math.max(x1 - x0, y1 - y0, 1) * 1.12, s = Math.min(w, h) / span, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, X = p => w / 2 + (p[0] - cx) * s, Y = p => h / 2 - (p[1] - cy) * s;
    g.fillStyle = '#040f1b'; g.fillRect(0, 0, w, h);
    for (const b of view.bodies) { if (b.path) { g.strokeStyle = '#1f4a6d'; g.lineWidth = 1; g.beginPath(); for (let k = 0; k < b.path.length; k += 3) { const p = P(b.path[k], b.path[k + 1], b.path[k + 2]); k ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)); } g.stroke(); }
      const bp = bodyAt(b, index), p = P(...bp); g.fillStyle = BODY_COLOR[b.id] ?? '#888'; g.beginPath(); g.arc(X(p), Y(p), Math.max(3, b.radius * s), 0, 7); g.fill(); g.fillStyle = '#cfe2f1'; g.font = '11px DM Sans, sans-serif'; g.fillText(b.name, X(p) + Math.max(5, b.radius * s) + 4, Y(p) - 4); }
    g.strokeStyle = '#2f5f86'; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < N; i++) { const p = P(t[3 * i], t[3 * i + 1], t[3 * i + 2]); i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)); } g.stroke();
    g.strokeStyle = '#56cae5'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= index; i++) { const p = P(t[3 * i], t[3 * i + 1], t[3 * i + 2]); i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)); } g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(cur), Y(cur), 4.5, 0, 7); g.fill();
  }, [size, basis, view, index, zoomOn]);
  return <div ref={wrap} style={{ position: 'absolute', inset: 0 }}><canvas ref={ref} style={{ width: '100%', height: '100%' }} role="img" aria-label="Two-dimensional projection of the computed trajectory onto its orbital plane" /></div>;
}

/** three.js view of the propagated trajectory. The library is bundled locally and loaded on demand; no CDN is used. */
function View3D({ view, index, sample, follow, useModel, onFail }) {
  const host = useRef(null), S = useRef(null);
  useEffect(() => {
    let dead = false, raf = 0, cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three'), { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (dead) return; const el = host.current, renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(el.clientWidth, el.clientHeight); el.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color('#040f1b');
        const t = view.track, N = t.length / 3; let ext = 0; for (let i = 0; i < t.length; i++) ext = Math.max(ext, Math.abs(t[i])); for (const b of view.bodies) { ext = Math.max(ext, b.radius); if (b.path) for (let i = 0; i < b.path.length; i++) ext = Math.max(ext, Math.abs(b.path[i])); }
        const k = 10 / ext, camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 1e-7, 500); camera.up.set(0, 0, 1); camera.position.set(9, -14, 9);
        const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false; controls.minDistance = 1e-5; controls.maxDistance = 200;
        scene.add(new THREE.AmbientLight(0xffffff, 0.55)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(30, -10, 12); scene.add(sun);
        const scaled = new Float32Array(t.length); for (let i = 0; i < t.length; i++) scaled[i] = t[i] * k;
        const mk = (arr, color, opacity = 1) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })); };
        const full = mk(scaled, '#2f5f86', 0.9), done = mk(scaled.slice(), '#56cae5'); scene.add(full, done);
        const bodies = view.bodies.map(b => { const m = new THREE.Mesh(new THREE.SphereGeometry(b.radius * k, 48, 24), b.id === 'sun' ? new THREE.MeshBasicMaterial({ color: BODY_COLOR.sun }) : new THREE.MeshStandardMaterial({ color: BODY_COLOR[b.id] ?? '#888', roughness: 0.9 })); m.rotation.x = Math.PI / 2; scene.add(m);
          const dot = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)), new THREE.PointsMaterial({ color: BODY_COLOR[b.id] ?? '#888', size: 5, sizeAttenuation: false })); scene.add(dot);
          if (b.path) { const pa = new Float32Array(b.path.length); for (let i = 0; i < pa.length; i++) pa[i] = b.path[i] * k; scene.add(mk(pa, '#1f4a6d', 0.8)); } return { b, m, dot }; });
        const marker = new THREE.Group(), cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1, 16), new THREE.MeshStandardMaterial({ color: '#f6efe4', emissive: '#40342c' })); marker.add(cone); scene.add(marker);
        let model = null;
        if (useModel) { const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'); new GLTFLoader().load(`${import.meta.env.BASE_URL}models/SaturnV.glb`, g => { if (dead) return; const box = new THREE.Box3().setFromObject(g.scene), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), long = Math.max(sz.x, sz.y, sz.z);
          g.scene.position.sub(c); const holder = new THREE.Group(); holder.add(g.scene); holder.scale.setScalar(1.6 / long); if (sz.z === long) holder.rotation.x = -Math.PI / 2; else if (sz.x === long) holder.rotation.z = Math.PI / 2; model = holder; marker.remove(cone); marker.add(holder); }, undefined, () => { /* keep the cone marker if the model cannot be loaded */ }); }
        const state = { index: 0, sample: null, follow: false }, vY = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), prev = new THREE.Vector3();
        S.current = state;
        const resize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); };
        const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null; ro?.observe(el);
        const tick = () => { if (dead) return; const i = Math.min(state.index, N - 1); marker.position.set(scaled[3 * i], scaled[3 * i + 1], scaled[3 * i + 2]);
          const bx = state.sample?.body_x; if (bx) marker.quaternion.setFromUnitVectors(vY, tmp.set(bx[0], bx[1], bx[2]).normalize());
          done.geometry.setDrawRange(0, i + 1);
          for (const o of bodies) { const p = bodyAt(o.b, i); o.m.position.set(p[0] * k, p[1] * k, p[2] * k); o.dot.position.copy(o.m.position); }
          if (state.follow) { tmp.copy(marker.position).sub(prev); camera.position.add(tmp); controls.target.copy(marker.position); } prev.copy(marker.position);
          controls.update(); marker.scale.setScalar(camera.position.distanceTo(marker.position) * 0.035); renderer.render(scene, camera); raf = requestAnimationFrame(tick); };
        state.focus = () => { const d = Math.max(camera.position.distanceTo(controls.target), 1e-4); controls.target.copy(marker.position); const out = marker.position.lengthSq() > 1e-12 ? marker.position.clone().normalize() : new THREE.Vector3(0.5, -0.7, 0.5).normalize(), side = new THREE.Vector3(0, 0, 1).cross(out); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); camera.position.copy(marker.position).add(out.multiplyScalar(0.8).add(side.normalize().multiplyScalar(0.6)).multiplyScalar(Math.min(d, 0.5))); };
        state.overview = () => { controls.target.set(0, 0, 0); camera.position.set(9, -14, 9); };
        tick();
        cleanup = () => { cancelAnimationFrame(raf); ro?.disconnect(); controls.dispose(); renderer.dispose(); scene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); renderer.domElement.remove(); };
        if (dead) cleanup();
      } catch (e) { if (!dead) onFail(e); }
    })();
    return () => { dead = true; cleanup(); S.current = null; };
  }, [view, useModel]);   // eslint-disable-line
  useEffect(() => { const s = S.current; if (s) { s.index = index; s.sample = sample; const was = s.follow; s.follow = follow; if (follow && !was) s.focus?.(); if (!follow && was) s.overview?.(); } });
  return <div ref={host} style={{ position: 'absolute', inset: 0 }} role="img" aria-label="Three-dimensional view of the computed trajectory. Drag to rotate, scroll to zoom." />;
}

export default function FlightView({ result, index, vehicleLabel, useModel = false }) {
  const [vi, setVi] = useState(0), [mode, setMode] = useState(() => webglAvailable() ? '3d' : '2d'), [follow, setFollow] = useState(false), [note, setNote] = useState(webglAvailable() ? '' : 'WebGL is not available in this browser; showing the 2-D projection.');
  const views = result.views, view = views[Math.min(vi, views.length - 1)], s = result.samples[Math.min(index, result.samples.length - 1)];
  useEffect(() => { setVi(0); setFollow(false); }, [result]);
  return <div className="sim-view3d">
    {mode === '3d' ? <View3D key={view.id} view={view} index={index} sample={s} follow={follow} useModel={useModel} onFail={() => { setMode('2d'); setNote('The 3-D view could not start; showing the 2-D projection.'); }} /> : <View2D view={view} index={index} zoomOn={follow} />}
    <div className="sim-view3d-hud"><div>{view.label}</div><div>T+ {fmt(s.t, 6)} s{s.utc ? ` · ${s.utc.slice(0, 19)}Z` : ''}</div><div>alt {fmt(s.alt / 1000, 5)} km · speed {fmt(s.speed, 5)} m/s{s.centre ? ` (rel. ${s.centre})` : ''}</div>
      <div>{vehicleLabel} — marker enlarged, not to scale; bodies to scale</div>{note && <div style={{ color: '#ffd27a' }}>{note}</div>}</div>
    <div className="sim-view3d-ctl">{views.length > 1 && views.map((v, i) => <button type="button" key={v.id} aria-pressed={vi === i} onClick={() => setVi(i)}>{v.id[0].toUpperCase() + v.id.slice(1)} frame</button>)}
      <button type="button" aria-pressed={follow} onClick={() => setFollow(f => !f)}>{follow ? 'Following vehicle' : 'Follow vehicle'}</button>
      <button type="button" aria-pressed={mode === '2d'} onClick={() => { if (mode === '2d' && !webglAvailable()) return; setMode(m => m === '3d' ? '2d' : '3d'); }}>{mode === '3d' ? '2-D view' : '3-D view'}</button></div>
  </div>;
}
