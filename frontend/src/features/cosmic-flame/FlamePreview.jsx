import React, { useEffect, useRef } from 'react';

/**
 * Educational flame drawing driven by the simplified model's illustrative shape
 * parameters. It is a picture, not a simulation: no geometry here is computed
 * from combustion physics.
 */
export default function FlamePreview({ shape, regime, reducedMotion, flowCmS }) {
  const ref = useRef(null);
  const state = useRef({ shape, regime, flowCmS });
  state.current = { shape, regime, flowCmS };

  useEffect(() => {
    const canvas = ref.current; const ctx = canvas.getContext('2d');
    let raf = 0, t = 0, last = performance.now(), cur = { ...state.current.shape };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() { const r = canvas.getBoundingClientRect(); canvas.width = r.width * dpr; canvas.height = r.height * dpr; }
    const ro = new ResizeObserver(() => { size(); draw(0); }); ro.observe(canvas); size();
    function draw(dt) {
      const { shape: target, regime: rg, flowCmS: flow } = state.current;
      const k = Math.min(1, dt * 4); // ease toward target shape
      for (const key of Object.keys(target)) cur[key] = (cur[key] ?? target[key]) + (target[key] - (cur[key] ?? target[key])) * (dt ? k : 1);
      t += dt;
      const W = canvas.width, H = canvas.height; ctx.clearRect(0, 0, W, H);
      const cx = W * 0.5, base = H * 0.68, R = Math.min(W, H) * 0.16;
      const flicker = reducedMotion ? 0 : Math.sin(t * 9) * 0.04 + Math.sin(t * 13.7) * 0.03;
      const height = R * (cur.elongation * (1 - cur.roundness * 0.55)) * (1 + flicker);
      const width = R * (0.7 + cur.roundness * 0.5);
      const lean = cur.lean * R * 1.4;
      // flow guide lines
      if (flow > 0) {
        ctx.strokeStyle = 'rgba(86,202,229,.35)'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([5 * dpr, 9 * dpr]);
        ctx.lineDashOffset = reducedMotion ? 0 : -t * 40 * dpr;
        for (let i = 0; i < 5; i++) { const y = H * 0.25 + i * H * 0.11; ctx.beginPath(); ctx.moveTo(W * 0.05, y); ctx.lineTo(W * 0.95, y); ctx.stroke(); }
        ctx.setLineDash([]);
      }
      // halo
      const halo = ctx.createRadialGradient(cx + lean * 0.5, base - height * 0.5, 0, cx + lean * 0.5, base - height * 0.5, Math.max(width, height) * 1.9);
      halo.addColorStop(0, `rgba(120,200,255,${0.32 * cur.intensity})`); halo.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      // flame body (sooty-yellow tip fades as roundness/diffusion grows)
      const body = ctx.createLinearGradient(cx, base + width * 0.3, cx + lean, base - height * 1.6);
      const blue = `rgba(70,150,255,${0.95 * cur.intensity})`;
      const yellow = `rgba(255,190,90,${(1 - cur.roundness) * 0.9 * cur.intensity})`;
      body.addColorStop(0, blue); body.addColorStop(0.45, `rgba(140,205,255,${0.85 * cur.intensity})`); body.addColorStop(0.8, yellow); body.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(cx - width, base);
      ctx.bezierCurveTo(cx - width, base + width * 0.9, cx + width, base + width * 0.9, cx + width, base);
      ctx.bezierCurveTo(cx + width, base - height * 0.6, cx + lean + width * 0.2, base - height * 1.2, cx + lean, base - height * 1.55 - width * cur.roundness * 0.4);
      ctx.bezierCurveTo(cx + lean - width * 0.2, base - height * 1.2, cx - width, base - height * 0.6, cx - width, base);
      ctx.fill();
      // fuel source
      ctx.fillStyle = '#29445e'; ctx.beginPath(); ctx.arc(cx, base + width * 0.15, Math.max(3, R * 0.12), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(207,227,245,.75)'; ctx.font = `${10 * dpr}px DM Sans, sans-serif`; ctx.fillText('ILLUSTRATION · NOT A SIMULATION', 12 * dpr, H - 12 * dpr);
      if (rg) { ctx.textAlign = 'right'; ctx.fillText(rg.toUpperCase(), W - 12 * dpr, 20 * dpr); ctx.textAlign = 'left'; }
    }
    function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!document.hidden) draw(dt); raf = requestAnimationFrame(loop); }
    if (reducedMotion) draw(0); else raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // With reduced motion, redraw statically whenever the inputs change.
  }, [reducedMotion, reducedMotion ? JSON.stringify(shape) + regime + flowCmS : null]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="cf-flame" role="img" aria-label={`Illustrative flame drawing: ${regime}. Not a simulation.`} />;
}
