import React, { useEffect, useRef } from 'react';
import { BODIES, EARTH_MOON, getOrbitPosition, getMoonPosition } from '../../scientific/cosmicPhysics.js';

// A functioning 2D educational observatory for browsers with disabled or unavailable WebGL.
// Orbital radii, body sizes and speeds remain deliberately schematic (not a precision ephemeris).
const BODIES_WITH_MOON = [...BODIES, EARTH_MOON];
const STARFIELD = Array.from({ length: 160 }, (_, i) => {
  const fract = n => n - Math.floor(n);
  return { x: fract(Math.sin(i * 124.12 + 32) * 43758.5453), y: fract(Math.sin(i * 73.41 + 71) * 14682.283), a: .14 + .6 * fract(Math.sin(i * 18.12 + 34) * 19537.27) };
});

export default function SolarSystemFallback({ selected, onSelect, speed, paused, reason }) {
  const ref = useRef(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 740px)');
    const scene = { day: 0, yaw: -.32, zoom: 1, width: 1, height: 1, scale: 1, last: 0 };
    let animation = 0, visible = true, pointer = null, positions = [];
    let frameTime = 0;
    const visibleObserver = typeof IntersectionObserver === 'undefined' ? { observe() {}, disconnect() {} } : new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; }, { threshold: .02 });
    visibleObserver.observe(canvas);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      scene.width = Math.max(1, rect.width); scene.height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1.4 : 1.8);
      canvas.width = Math.max(1, Math.round(scene.width * dpr));
      canvas.height = Math.max(1, Math.round(scene.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize);
    resize();
    const toScreen = pos => {
      const scale = scene.scale;
      const angle = scene.yaw;
      const rotatedX = pos.x * Math.cos(angle) - pos.z * Math.sin(angle);
      const rotatedZ = pos.x * Math.sin(angle) + pos.z * Math.cos(angle);
      return { x: scene.width / 2 + rotatedX * scale, y: scene.height * .51 + rotatedZ * scale * .46 - pos.y * scale };
    };
    const draw = timestamp => {
      animation = requestAnimationFrame(draw);
      if (document.hidden || !visible) { scene.last = timestamp; return; }
      if (frameTime && timestamp - frameTime < (mobile.matches ? 1000 / 24 : 1000 / 30)) return;
      frameTime = timestamp;
      const dt = scene.last ? Math.min(.08, (timestamp - scene.last) / 1000) : 0;
      scene.last = timestamp;
      if (!pausedRef.current && !reducedMotion.matches) scene.day += dt * speedRef.current;
      const { width: w, height: h } = scene;
      scene.scale = Math.min(w * .445 / 21.8, h * .465 / (21.8 * .46)) * scene.zoom;
      ctx.fillStyle = '#07192b'; ctx.fillRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(w / 2, h * .51, 0, w / 2, h * .51, Math.max(w, h) * .72);
      glow.addColorStop(0, '#153e58'); glow.addColorStop(.44, '#0b2942'); glow.addColorStop(1, '#07192b');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      for (const star of STARFIELD) {
        ctx.fillStyle = `rgba(190,224,253,${star.a})`;
        ctx.beginPath(); ctx.arc(star.x * w, star.y * h, star.a > .55 ? 1 : .65, 0, Math.PI * 2); ctx.fill();
      }
      const center = toScreen({ x: 0, y: 0, z: 0 });
      for (const planet of BODIES.filter(b => b.orbit > 0)) {
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, planet.orbit * scene.scale, planet.orbit * scene.scale * .46, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#4b829743'; ctx.lineWidth = 1; ctx.stroke();
      }
      const selectedId = selectedRef.current?.type === 'body' ? selectedRef.current.id : null;
      positions = BODIES_WITH_MOON.map(body => {
        const point = body.id === 'moon' ? getMoonPosition(scene.day) : getOrbitPosition(body, scene.day);
        const pos = toScreen(point);
        const radius = body.id === 'sun' ? 17 : Math.max(body.id === 'moon' ? 3 : 4, body.radius * 12);
        return { body, ...pos, radius, behind: point.z < 0 };
      });
      // 2D painter's depth ordering for a schematic tilted orbital plane.
      positions.sort((a, b) => Number(b.behind) - Number(a.behind));
      for (const item of positions) {
        const { body, x, y, radius } = item;
        const sun = body.id === 'sun';
        if (sun) {
          const halo = ctx.createRadialGradient(x, y, radius * .3, x, y, 54);
          halo.addColorStop(0, '#ffc46674'); halo.addColorStop(1, '#ffc46600');
          ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, 54, 0, 2 * Math.PI); ctx.fill();
        }
        const paint = ctx.createRadialGradient(x - radius * .3, y - radius * .35, radius * .05, x, y, radius);
        paint.addColorStop(0, sun ? '#fff3ba' : '#f7fafe'); paint.addColorStop(.17, body.color);
        paint.addColorStop(1, sun ? '#de7825' : '#1b344b');
        ctx.fillStyle = paint; ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI); ctx.fill();
        if (body.id === 'saturn') {
          ctx.beginPath(); ctx.ellipse(x, y, radius * 1.8, radius * .51, -.32, 0, Math.PI * 2);
          ctx.lineWidth = 3; ctx.strokeStyle = '#d9c89bc0'; ctx.stroke();
        }
        if (selectedId === body.id) {
          ctx.beginPath(); ctx.arc(x, y, radius + 7, 0, 2 * Math.PI);
          ctx.strokeStyle = '#83e6ff'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, radius + 12, 0, 2 * Math.PI);
          ctx.strokeStyle = '#83e6ff50'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      // Place text in a dedicated pass to avoid crowded, overlapping labels on mobile.
      const occupied = [];
      const labels = [...positions].sort((a, b) =>
        Number(b.body.id === selectedId) - Number(a.body.id === selectedId) ||
        b.radius - a.radius
      );
      for (const item of labels) {
        const { body, x, y, radius } = item;
        if (body.id === 'moon' && selectedId !== 'moon') continue;
        const chosen = body.id === selectedId;
        ctx.font = `600 ${chosen ? 12 : 10}px system-ui, sans-serif`;
        const tw = ctx.measureText(body.name).width + 12, th = chosen ? 20 : 17;
        const gap = radius + 6;
        const spots = [
          { x: x + gap, y: y - th - 4 }, { x: x + gap, y: y + 2 },
          { x: x - gap - tw, y: y - th - 4 }, { x: x - gap - tw, y: y + 2 },
          { x: x - tw / 2, y: y - gap - th }, { x: x - tw / 2, y: y + gap },
        ];
        const spot = spots.find(s => s.x >= 4 && s.y >= 38 && s.x + tw < w - 4 && s.y + th < h - 70 &&
          !occupied.some(o => s.x < o.x + o.w + 3 && s.x + tw + 3 > o.x && s.y < o.y + o.h + 3 && s.y + th + 3 > o.y));
        if (!spot) continue;
        occupied.push({ x: spot.x, y: spot.y, w: tw, h: th });
        ctx.fillStyle = chosen ? '#153f59db' : '#0a2539a6';
        ctx.beginPath(); ctx.roundRect(spot.x, spot.y, tw, th, 4); ctx.fill();
        ctx.fillStyle = chosen ? '#f2ffff' : '#b7d6e6';
        ctx.textAlign = 'left'; ctx.fillText(body.name, spot.x + 6, spot.y + th - 5);
      }
    };
    const point = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pointerDown = e => { const p = point(e); pointer = { ...p, yaw: scene.yaw, dragged: false }; canvas.setPointerCapture?.(e.pointerId); };
    const pointerMove = e => {
      if (!pointer) return;
      const p = point(e);
      if (Math.abs(p.x - pointer.x) + Math.abs(p.y - pointer.y) > 6) pointer.dragged = true;
      if (pointer.dragged) scene.yaw = pointer.yaw + (p.x - pointer.x) * .007;
    };
    const pointerUp = e => {
      if (!pointer) return;
      const dragged = pointer.dragged; pointer = null;
      if (dragged) return;
      const p = point(e);
      const closest = positions.reduce((best, item) => {
        const d = Math.hypot(p.x - item.x, p.y - item.y);
        return d < Math.max(17, item.radius + 9) && d < best.distance ? { distance: d, body: item.body } : best;
      }, { distance: Infinity, body: null });
      if (closest.body) onSelectRef.current({ type: 'body', id: closest.body.id });
    };
    const wheel = e => { e.preventDefault(); scene.zoom = Math.max(.6, Math.min(2.1, scene.zoom * Math.exp(-e.deltaY * .001))); };
    const keydown = e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); scene.yaw += e.key === 'ArrowLeft' ? -.14 : .14; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); scene.zoom = Math.min(2.1, scene.zoom * 1.1); }
      if (e.key === '-') { e.preventDefault(); scene.zoom = Math.max(.6, scene.zoom / 1.1); }
    };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('keydown', keydown);
    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation); visibleObserver.disconnect(); resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', keydown);
    };
  }, []);

  return <div className="solar-2d-mode">
    <canvas ref={ref} tabIndex={0} aria-label="Interactive 2D schematic solar system. Click a planet, drag to rotate the view, use arrows to rotate or plus and minus to zoom."/>
    <div className="solar-mode-info" role="status"><strong>2D OBSERVATORY</strong><span>{reason === 'shader' ? '3D graphics initialization failed' : reason === 'lost' ? '3D graphics context was interrupted' : 'WebGL unavailable in this browser session'}. Interactive 2D mode is active.</span></div>
    <div className="solar-2d-select" aria-label="Select a celestial body">{BODIES_WITH_MOON.map(b => <button type="button" key={b.id} className={selected?.type === 'body' && selected.id === b.id ? 'active' : ''} aria-pressed={selected?.type === 'body' && selected.id === b.id} onClick={() => onSelect({ type: 'body', id: b.id })}>{b.name}</button>)}</div>
  </div>;
}
