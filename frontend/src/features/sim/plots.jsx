/** Canvas plots of computed series and solver fields (from SOLARIS 5.0), restyled for the SOLARIS light theme. */
import React, { useEffect, useRef, useState } from 'react';
import { fmt } from './ui.jsx';

const COLORS = ['#1679c2', '#2bb3a3', '#c8861a', '#6b5bd2', '#c2475b', '#56cae5', '#154e77'];
function useCanvas(draw, deps, aspect) {
  const ref = useRef(null), wrap = useRef(null), [w, setW] = useState(600);
  useEffect(() => { const el = wrap.current; if (!el) return undefined; setW(el.clientWidth || 600); if (!('ResizeObserver' in window)) return undefined; const ro = new ResizeObserver(() => setW(el.clientWidth || 600)); ro.observe(el); return () => ro.disconnect(); }, []);
  useEffect(() => { const c = ref.current; if (!c) return; const dpr = Math.min(2, window.devicePixelRatio || 1), h = Math.max(140, Math.round(w * aspect)); c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px'; const g = c.getContext('2d'); if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0); draw(g, w, h); }, [w, ...deps]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { ref, wrap };
}
const ticks = (a, b, n = 5) => { if (!(b > a)) return [a]; const raw = (b - a) / n, p = 10 ** Math.floor(Math.log10(raw)), s = [1, 2, 5, 10].find(m => m * p >= raw) * p, out = []; for (let v = Math.ceil(a / s) * s; v <= b + 1e-9 * s; v += s) out.push(Math.abs(v) < 1e-12 * s ? 0 : v); return out; };

/** Line plot. series: [{label, x:[], y:[], color?}]; optional cursor, dashed event lines and click-to-pick. */
export function LinePlot({ title, series, xLabel, yLabel, cursor = null, events = [], logY = false, aspect = 0.42, onPick }) {
  const data = series.filter(s => s?.x?.length && s?.y?.length);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of data) for (let i = 0; i < s.x.length; i++) { const x = s.x[i], y = logY ? (s.y[i] > 0 ? Math.log10(s.y[i]) : NaN) : s.y[i]; if (Number.isFinite(x) && Number.isFinite(y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  if (!(y1 > y0)) { const d = Math.abs(y0) * 0.05 || 1; y0 -= d; y1 += d; } else { const d = (y1 - y0) * 0.06; y0 -= d; y1 += d; }
  const L = 62, R = 14, T = 12, B = 38;
  const { ref, wrap } = useCanvas((g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    if (!data.length || !Number.isFinite(x0)) { g.fillStyle = '#7d93a6'; g.font = '12px DM Sans, sans-serif'; g.fillText('No data to plot.', 20, 30); return; }
    const X = x => L + (x - x0) / (x1 - x0 || 1) * (w - L - R), Y = y => h - B - (y - y0) / (y1 - y0) * (h - T - B);
    g.font = '10.5px DM Sans, sans-serif'; g.strokeStyle = '#eef3f7'; g.fillStyle = '#6f8ea4'; g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle'; for (const t of ticks(y0, y1)) { g.beginPath(); g.moveTo(L, Y(t)); g.lineTo(w - R, Y(t)); g.stroke(); g.fillText(logY ? '1e' + fmt(t, 3) : fmt(t, 4), L - 6, Y(t)); }
    g.textAlign = 'center'; g.textBaseline = 'top'; for (const t of ticks(x0, x1, Math.max(3, Math.floor(w / 110)))) { g.beginPath(); g.moveTo(X(t), T); g.lineTo(X(t), h - B); g.stroke(); g.fillText(fmt(t, 4), X(t), h - B + 5); }
    g.strokeStyle = '#d9e7f1'; g.beginPath(); g.moveTo(L, T); g.lineTo(L, h - B); g.lineTo(w - R, h - B); g.stroke();
    g.fillStyle = '#5d7286'; g.font = '600 11px DM Sans, sans-serif'; if (xLabel) g.fillText(xLabel, (L + w - R) / 2, h - 15);
    if (yLabel) { g.save(); g.translate(12, (T + h - B) / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(yLabel, 0, 0); g.restore(); }
    for (const e of events) if (e.t >= x0 && e.t <= x1) { g.strokeStyle = '#9fb7c9'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X(e.t), T); g.lineTo(X(e.t), h - B); g.stroke(); g.setLineDash([]); }
    data.forEach((s, k) => { g.strokeStyle = s.color || COLORS[k % COLORS.length]; g.lineWidth = 1.8; g.beginPath(); let pen = false;
      for (let i = 0; i < s.x.length; i++) { const y = logY ? (s.y[i] > 0 ? Math.log10(s.y[i]) : NaN) : s.y[i]; if (!Number.isFinite(y) || !Number.isFinite(s.x[i])) { pen = false; continue; } if (pen) g.lineTo(X(s.x[i]), Y(y)); else { g.moveTo(X(s.x[i]), Y(y)); pen = true; } } g.stroke(); });
    if (cursor != null && cursor >= x0 && cursor <= x1) { g.strokeStyle = '#0b2c47'; g.globalAlpha = 0.45; g.lineWidth = 1; g.beginPath(); g.moveTo(X(cursor), T); g.lineTo(X(cursor), h - B); g.stroke(); g.globalAlpha = 1; }
  }, [JSON.stringify([x0, x1, y0, y1, cursor, data.length, data.map(s => s.x.length), logY]), series], aspect);
  const pick = e => { if (!onPick || !Number.isFinite(x0)) return; const r = e.currentTarget.getBoundingClientRect(), f = (e.clientX - r.left - L) / (r.width - L - R); onPick(x0 + Math.min(1, Math.max(0, f)) * (x1 - x0)); };
  return <figure className="sim-figure">{title && <figcaption className="sim-plot-title">{title}</figcaption>}
    <div className="sim-plot" ref={wrap}><canvas ref={ref} role="img" aria-label={`${title || 'Plot'}: ${data.map(s => s.label).join(', ')} versus ${xLabel || 'x'}`} onClick={pick} style={onPick ? { cursor: 'crosshair' } : undefined} /></div>
    {data.length > 1 && <div className="sim-legend">{data.map((s, k) => <span key={s.label}><i style={{ background: s.color || COLORS[k % COLORS.length] }} />{s.label}</span>)}</div>}</figure>;
}

const RAMP = [[0, 4, 8, 20], [0.2, 60, 16, 90], [0.4, 150, 30, 60], [0.6, 225, 80, 25], [0.8, 250, 170, 50], [1, 255, 250, 220]];
const ramp = f => { f = Math.min(1, Math.max(0, f)); let i = 1; while (i < RAMP.length - 1 && f > RAMP[i][0]) i++; const a = RAMP[i - 1], b = RAMP[i], s = (f - a[0]) / (b[0] - a[0]); return [a[1] + s * (b[1] - a[1]), a[2] + s * (b[2] - a[2]), a[3] + s * (b[3] - a[3])]; };

/** Colour map of a computed 2-D solver field (cell values, row-major [ix*ny + iy]); axisymmetric fields are mirrored about the axis. */
export function FieldMap({ frame, field, grid, label, unit, range }) {
  const f = frame?.fields?.[field], nx = frame?.nx, ny = frame?.ny, axi = grid?.geometry === 'axisymmetric';
  const lo = range?.[0] ?? f?.min ?? 0, hi = range?.[1] ?? f?.max ?? 1;
  const W = (axi ? 2 : 1) * (ny || 1), H = nx || 1, aspect = Math.min(1.5, Math.max(0.35, (H * (grid?.dx_m || 1)) / (W * (grid?.dy_m || 1))));
  const { ref, wrap } = useCanvas((g, w, h) => {
    g.fillStyle = '#061626'; g.fillRect(0, 0, w, h); if (!f) return;
    const off = document.createElement('canvas'); off.width = W; off.height = H; const og = off.getContext('2d'), img = og.createImageData(W, H);
    for (let ix = 0; ix < nx; ix++) for (let j = 0; j < W; j++) { const iy = axi ? (j < ny ? ny - 1 - j : j - ny) : j, v = f.data[ix * ny + iy], c = ramp((v - lo) / (hi - lo || 1)), p = ((H - 1 - ix) * W + j) * 4; img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255; }
    og.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, 0, 0, w - 74, h);
    const bx = w - 60; for (let i = 0; i < h - 30; i++) { const c = ramp(1 - i / (h - 31)); g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; g.fillRect(bx, 15 + i, 12, 1); }
    g.fillStyle = '#d7e8f5'; g.font = '10px DM Sans, sans-serif'; g.textBaseline = 'middle'; g.fillText(fmt(hi, 3), bx + 16, 17); g.fillText(fmt(lo, 3), bx + 16, h - 17); g.fillText(unit || '', bx + 16, h / 2);
  }, [frame, field, lo, hi], aspect);
  return <figure className="sim-figure"><figcaption className="sim-plot-title">{label} — computed field at t = {fmt(frame?.t, 4)} s {axi ? '(mirrored about the symmetry axis; burner at bottom)' : '(burner at bottom)'}</figcaption>
    <div className="sim-plot sim-plot-dark" ref={wrap}><canvas ref={ref} role="img" aria-label={`${label} field from the solver at time ${fmt(frame?.t, 4)} seconds, range ${fmt(lo, 3)} to ${fmt(hi, 3)} ${unit || ''}`} /></div></figure>;
}
