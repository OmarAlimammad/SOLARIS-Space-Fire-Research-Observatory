import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Lightweight, stylised solar-system scene. Distances and sizes are NOT to scale.
 * Performance budget: ~1.5k triangles per body, one light, DPR capped at 1.75,
 * rendering paused when off-screen, when the tab is hidden, or (with reduced motion)
 * whenever the camera is not moving.
 */
const BODIES = [
  { id: 'earth', label: 'Earth', color: '#3f8fdc', radius: 1.0, orbit: 9, speed: 0.12, phase: 0.6 },
  { id: 'mars', label: 'Mars', color: '#c86a43', radius: 0.62, orbit: 14, speed: 0.065, phase: 2.4 },
];


export default function SolarScene({ selected, onSelect, speed = 1, reducedMotion }) {
  const mount = useRef(null);
  const api = useRef({});
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    camera.position.set(0, 13, 24);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 6; controls.maxDistance = 48; controls.enablePan = false;

    scene.add(new THREE.AmbientLight('#9db7d1', 0.55));
    const sunLight = new THREE.PointLight('#fff4e0', 2.2, 0, 0); scene.add(sunLight);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(2.2, 40, 24), new THREE.MeshBasicMaterial({ color: '#ffcc66' }));
    sun.userData = { id: null, label: 'Sun' }; scene.add(sun);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 16), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.16 }));
    scene.add(glow);

    // starfield
    const starGeo = new THREE.BufferGeometry(); const pts = [];
    let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 900; i++) { const r = 120 + rnd() * 60, t = rnd() * Math.PI * 2, p = Math.acos(2 * rnd() - 1); pts.push(r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#cfe3f5', size: 0.5, sizeAttenuation: true })));

    const pickables = [];
    const bodies = BODIES.map(b => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(b.orbit - 0.02, b.orbit + 0.02, 128), new THREE.MeshBasicMaterial({ color: '#6c8fb0', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; scene.add(ring);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.radius, 36, 22), new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.75, metalness: 0.05, emissive: b.color, emissiveIntensity: 0.06 }));
      mesh.userData = { id: b.id, label: b.label }; scene.add(mesh); pickables.push(mesh);
      return { ...b, mesh };
    });
    const earth = bodies[0];
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.9 }));
    moon.userData = { id: 'moon', label: 'Moon' }; scene.add(moon); pickables.push(moon);
    const iss = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: '#7de5e6' }));
    iss.userData = { id: 'iss', label: 'ISS orbit (microgravity)' }; scene.add(iss); pickables.push(iss);
    const issHit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    issHit.userData = iss.userData; scene.add(issHit); pickables.push(issHit);
    const selRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.08, 64), new THREE.MeshBasicMaterial({ color: '#56cae5', side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    scene.add(selRing);

    let t = 0, last = performance.now(), frame = 0, visible = true, dirty = true;
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    function place(dt) {
      t += dt * api.current.speed;
      for (const b of bodies) b.mesh.position.set(Math.cos(t * b.speed + b.phase) * b.orbit, 0, Math.sin(t * b.speed + b.phase) * b.orbit);
      moon.position.copy(earth.mesh.position).add(new THREE.Vector3(Math.cos(t * 0.9) * 2.1, 0.15, Math.sin(t * 0.9) * 2.1));
      iss.position.copy(earth.mesh.position).add(new THREE.Vector3(Math.cos(t * 3) * 1.45, Math.sin(t * 3) * 0.5, Math.sin(t * 3) * 1.45));
      issHit.position.copy(iss.position); iss.rotation.y += dt * 2;
      const target = pickables.find(p => p.userData.id === api.current.selected);
      if (target) { const s = target === iss || target === issHit ? 0.5 : (target.geometry.parameters.radius || 0.5) * 1.5; selRing.visible = true; selRing.position.copy(target.position); selRing.scale.setScalar(s); selRing.lookAt(camera.position); } else selRing.visible = false;
    }
    function resize() { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
    function loop(now) {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible || document.hidden) return;
      const moving = controls.update();
      if (api.current.reduced && !moving && !dirty) return;
      place(api.current.reduced ? 0 : dt); renderer.render(scene, camera); dirty = false;
    }
    function pick(ev) {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      return ray.intersectObjects(pickables)[0]?.object.userData || null;
    }
    let down = null;
    const onDown = e => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) { const hit = pick(e); if (hit?.id) { api.current.onSelect(hit.id); dirty = true; } } down = null; };
    const onMove = e => { const hit = pick(e); renderer.domElement.style.cursor = hit?.id ? 'pointer' : 'grab'; setHover(hit?.id ? hit.label : null); };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    controls.addEventListener('change', () => { dirty = true; });
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
    place(0); renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
    api.current.markDirty = () => { dirty = true; };
    return () => {
      cancelAnimationFrame(frame); ro.disconnect(); io.disconnect(); controls.dispose();
      scene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => { Object.assign(api.current, { selected, onSelect, speed, reduced: reducedMotion }); api.current.markDirty?.(); }, [selected, onSelect, speed, reducedMotion]);

  return <div className="cf-scene" ref={mount} role="img" aria-label="Interactive 3D solar system. Click Earth, the Moon, Mars or the ISS marker to choose an environment. The buttons below offer the same choices.">
    {hover && <span className="cf-hover">{hover}</span>}
  </div>;
}
