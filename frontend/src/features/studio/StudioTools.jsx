import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Download, FlaskConical, Lightbulb, LoaderCircle, Play, Scale, Upload } from 'lucide-react';
import { api, getExperiments, useApi } from '../../lib/api.js';
import { useResearch } from '../../state/ResearchContext.jsx';
import { ApiError, EmptyState, EvidenceBadge, Skeleton } from '../../components/ui.jsx';

const CONCEPT_LABEL = (c) => c.replaceAll('-', ' ').replace(/^\w/, m => m.toUpperCase());

function ToolHead({ number, title, children, badge }) {
  return <div className="st-head">
    <div className="s-row" style={{ justifyContent: 'space-between' }}>
      <span className="eyebrow"><span className="eyebrow-line" /> WORKSPACE / {number}</span>
      {badge}
    </div>
    <h2>{title}</h2>
    <p>{children}</p>
  </div>;
}

function Quote({ f }) {
  return <figure className="st-quote">
    <blockquote>“{f.quote}”</blockquote>
    <figcaption>{f.source.identifier} — {f.locator} · <a href={f.source.url} target="_blank" rel="noopener noreferrer">source <ArrowUpRight size={11} /></a></figcaption>
  </figure>;
}

/* ------------------------------------------------------------ 02 Contradictions */
export function ContradictionTool() {
  const [concept, setConcept] = useState('flammability-limit');
  const r = useApi((o) => api.tensions(concept, o), [concept]);
  return <div className="research-panel st-panel">
    <ToolHead number="02" title="Scientific Contradiction Detector" badge={<EvidenceBadge kind="finding">Verbatim findings</EvidenceBadge>}>
      Align published statements about one concept by configuration, gravity condition and method. SOLARIS flags a contradiction only when a source states one — different conditions are not contradictory results.
    </ToolHead>
    <div className="st-chips" role="group" aria-label="Concept">{(r.data?.available_concepts || [concept]).map(c => <button key={c} type="button" className="s-chip" aria-pressed={c === concept} onClick={() => setConcept(c)}>{CONCEPT_LABEL(c)}</button>)}</div>
    {r.loading ? <Skeleton lines={6} /> : r.error ? <ApiError error={r.error} onRetry={r.reload} /> : <div className="s-tabpanel" key={concept}>
      <div className={`st-verdict st-${r.data.verdict}`}><Scale size={18} /><div><strong>{r.data.verdict_label}</strong>{r.data.context_dimensions_that_differ.length > 0 && <small>Context differs in: {r.data.context_dimensions_that_differ.join(', ')}</small>}</div></div>
      {r.data.source_stated_discrepancies.map(d => <div key={d.id} className="s-alert" style={{ marginTop: 10 }}><AlertTriangle size={17} /><div><strong>{d.label}.</strong> {d.explanation}</div></div>)}
      <div className="st-statements">{r.data.statements.map(s => <article key={s.id} className="s-card st-statement">
        <div className="s-row" style={{ justifyContent: 'space-between' }}><span className="s-label">{s.investigation.toUpperCase()}</span><EvidenceBadge kind="finding" /></div>
        <Quote f={s} />
        <dl className="st-context">{Object.entries(s.context).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </article>)}</div>
      <p className="s-muted" style={{ marginTop: 12 }}>{r.data.method} ({r.data.method_version})</p>
    </div>}
  </div>;
}

/* ------------------------------------------------------------ 03 Gaps */
export function GapTool() {
  const r = useApi((o) => api.gaps(o), []);
  const [cell, setCell] = useState(null);
  const { setExperiments } = useResearch();
  const max = useMemo(() => Math.max(1, ...(r.data?.cells || []).map(c => c.count)), [r.data]);
  return <div className="research-panel st-panel">
    <ToolHead number="03" title="Evidence Gap Explorer" badge={<EvidenceBadge kind="measured">Counted from NASA table</EvidenceBadge>}>
      Where does the imported evidence exist, and where is it missing? Each cell counts BASS-II rows for an explicit material group and a 2-point initial-O₂ bin. Empty means “no row in this table”, never “safe”.
    </ToolHead>
    {r.loading ? <Skeleton lines={8} /> : r.error ? <ApiError error={r.error} onRetry={r.reload} /> : <>
      <div className="st-heat-wrap">
        <table className="st-heat">
          <caption className="sr-only">BASS-II rows by material group and initial oxygen bin</caption>
          <thead><tr><th scope="col">Material group</th>{r.data.o2_bins.map(b => <th key={b.start} scope="col">{b.start}–{b.end}%</th>)}<th scope="col">O₂ n/r</th></tr></thead>
          <tbody>{r.data.material_groups.map(g => <tr key={g.group}><th scope="row">{g.group}<small>{g.count} rows</small></th>
            {r.data.o2_bins.map(b => {
              const c = r.data.cells.find(x => x.material_group === g.group && x.o2_bin_start === b.start);
              const sel = cell && cell.material_group === g.group && cell.o2_bin_start === b.start;
              return <td key={b.start}><button type="button" className={`st-cell ${c.count ? '' : 'is-empty'} ${sel ? 'is-sel' : ''}`} style={{ '--a': c.count / max }}
                onClick={() => setCell(c)} aria-label={`${g.group}, ${b.start} to ${b.end} percent: ${c.count} rows`}>{c.count || '·'}</button></td>;
            })}
            <td><span className="st-cell is-unknown">{g.unknown_o2 || '·'}</span></td></tr>)}</tbody>
        </table>
      </div>
      {cell && <div className="st-cell-detail s-tabpanel" key={`${cell.material_group}${cell.o2_bin_start}`}>
        <strong>{cell.material_group} · {cell.o2_bin_start}–{cell.o2_bin_end}% initial O₂</strong>
        {cell.count ? <><div className="cp-ids">{cell.record_ids.map(id => <span key={id} className="s-chip">{id}</span>)}</div>
          {cell.count >= 2 && <button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={() => { setExperiments(cell.record_ids.slice(0, 2)); window.location.hash = '/theater'; }}>Compare first two in Theater</button>}</>
          : <p className="s-muted">No BASS-II row in this combination. This is an evidence gap in the imported table — it says nothing about how the material would behave.</p>}
      </div>}
      <div className="s-grid-2" style={{ marginTop: 18 }}>
        <div><span className="s-label">Environment coverage</span>
          <ul className="st-env">{r.data.environment_coverage.map(e => <li key={e.environment} className={e.status}><strong>{e.environment}</strong><small>{e.basis}</small></li>)}</ul></div>
        <div><span className="s-label">Investigations — data held by SOLARIS</span>
          <ul className="st-avail">{r.data.investigation_availability.map(i => <li key={i.id}><span>{i.name}</span><span className={`st-level ${i.level}`}>{i.level === 'row_level_imported' ? `${i.imported_rows} rows` : 'catalog only'}</span><small>{i.findings} findings · {i.publications} pubs</small></li>)}</ul></div>
      </div>
      <ul className="st-limits">{r.data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </>}
  </div>;
}

/* ------------------------------------------------------------ 04 Transfer */
export function TransferTool() {
  const r = useApi((o) => api.transfer(o), []);
  return <div className="research-panel st-panel">
    <ToolHead number="04" title="Earth-to-Space Safety Transfer" badge={<EvidenceBadge kind="finding">Qualitative, source-bound</EvidenceBadge>}>
      Which findings speak to whether Earth-based fire knowledge carries over to microgravity? Read the sources’ own statements — SOLARIS does not issue engineering recommendations or risk numbers.
    </ToolHead>
    {r.loading ? <Skeleton lines={6} /> : r.error ? <ApiError error={r.error} onRetry={r.reload} /> : <>
      {r.data.questions.map(q => <section key={q.question} className="st-transfer">
        <h3 className="s-h3">{q.question}</h3>
        <div className="st-statements">{q.evidence_ids.map(id => r.data.statements.find(s => s.id === id)).filter(Boolean).map(s => <article key={s.id} className="s-card st-statement"><Quote f={s} /><dl className="st-context">{Object.entries(s.context).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></article>)}</div>
        <p className="st-reading"><EvidenceBadge kind="metadata">SOLARIS reading</EvidenceBadge> {q.reading}</p>
      </section>)}
      <div className="s-alert" style={{ marginTop: 16 }}><AlertTriangle size={17} /><ul className="st-plain">{r.data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
      <a className="s-btn s-btn-ghost s-btn-sm" href="#/habitat" style={{ marginTop: 12 }}>Explore habitat implications <ArrowUpRight size={13} /></a>
    </>}
  </div>;
}

/* ------------------------------------------------------------ 05 Flame tracker */
function analyseFrame(ctx, w, h, threshold) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let n = 0, sx = 0, sy = 0; const xs = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 4;
    const v = Math.max(data[i], data[i + 1], data[i + 2]);
    if (v >= threshold) { n++; sx += x; sy += y; if ((x + y) % 2 === 0) xs.push(x); }
  }
  if (n < 6) return null;
  xs.sort((a, b) => a - b);
  const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  return { area: n, cx: sx / n, cy: sy / n, left: q(0.02), right: q(0.98) };
}
function regress(pts) {
  if (pts.length < 3) return null;
  const n = pts.length, mx = pts.reduce((s, p) => s + p.t, 0) / n, my = pts.reduce((s, p) => s + p.v, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.t - mx) ** 2, 0); if (!sxx) return null;
  const slope = pts.reduce((s, p) => s + (p.t - mx) * (p.v - my), 0) / sxx;
  const resid = pts.reduce((s, p) => s + (p.v - (my + slope * (p.t - mx))) ** 2, 0);
  const se = Math.sqrt(resid / Math.max(1, n - 2) / sxx);
  return { slope, se, intercept: my - slope * mx };
}

export function FlameTracker() {
  const videoRef = useRef(null), canvasRef = useRef(null), abort = useRef(false);
  const [src, setSrc] = useState(null);
  const [name, setName] = useState('');
  const [meta, setMeta] = useState(null);
  const [threshold, setThreshold] = useState(150);
  const [step, setStep] = useState(0.25);
  const [edge, setEdge] = useState('right');
  const [pxPerMm, setPxPerMm] = useState('');
  const [run, setRun] = useState({ busy: false, progress: 0, rows: [] });
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); abort.current = true; }, [src]);

  async function analyse() {
    const v = videoRef.current, c = canvasRef.current; if (!v || !c) return;
    abort.current = false;
    const W = 240, H = Math.max(1, Math.round(W * v.videoHeight / v.videoWidth));
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const rows = []; const dur = v.duration; const scale = v.videoWidth / W;
    setRun({ busy: true, progress: 0, rows: [] });
    for (let t = 0; t <= dur && !abort.current; t += step) {
      await new Promise(res => { const on = () => { v.removeEventListener('seeked', on); res(); }; v.addEventListener('seeked', on); v.currentTime = Math.min(t, dur - 0.001); });
      ctx.drawImage(v, 0, 0, W, H);
      const res = [threshold - 25, threshold, threshold + 25].map(th => analyseFrame(ctx, W, H, Math.max(1, Math.min(254, th))));
      if (res[1]) {
        const edges = res.filter(Boolean).map(r => r[edge] * scale);
        rows.push({ t: +t.toFixed(3), edge: res[1][edge] * scale, lo: Math.min(...edges) - scale, hi: Math.max(...edges) + scale, area: res[1].area * scale * scale });
      }
      setRun({ busy: true, progress: t / dur, rows: [...rows] });
    }
    setRun({ busy: false, progress: 1, rows });
  }

  const cal = Number(pxPerMm) > 0 ? Number(pxPerMm) : null;
  const fit = useMemo(() => regress(run.rows.map(r => ({ t: r.t, v: r.edge }))), [run.rows]);
  const chart = useMemo(() => {
    if (run.rows.length < 2) return null;
    const W = 560, H = 200, P = 32;
    const t1 = run.rows[run.rows.length - 1].t, lo = Math.min(...run.rows.map(r => r.lo)), hi = Math.max(...run.rows.map(r => r.hi));
    const x = t => P + (t / (t1 || 1)) * (W - P - 8), y = v => H - P - ((v - lo) / ((hi - lo) || 1)) * (H - P - 10);
    const band = run.rows.map(r => `${x(r.t)},${y(r.hi)}`).join(' ') + ' ' + [...run.rows].reverse().map(r => `${x(r.t)},${y(r.lo)}`).join(' ');
    return { W, H, P, band, line: run.rows.map(r => `${x(r.t)},${y(r.edge)}`).join(' '), lo, hi, t1 };
  }, [run.rows]);
  function exportCsv() {
    const lines = ['time_s,edge_px,edge_lo_px,edge_hi_px,bright_area_px2', ...run.rows.map(r => [r.t, r.edge.toFixed(1), r.lo.toFixed(1), r.hi.toFixed(1), r.area.toFixed(0)].join(','))];
    const blob = new Blob([`# SOLARIS flame tracker — intensity threshold ${threshold}, edge=${edge}, file=${name}. Pixel units, not calibrated unless stated.\n${lines.join('\n')}`], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'SOLARIS_flame_track.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return <div className="research-panel st-panel">
    <ToolHead number="05" title="Uncertainty-Aware Flame Tracker" badge={<EvidenceBadge kind="model">Image-intensity analysis</EvidenceBadge>}>
      Load flame footage you are licensed to use (for example a BASS-II video downloaded from NASA PSI). SOLARIS tracks the bright region frame by frame in your browser and shows how the result moves when the threshold changes. Without spatial calibration, results stay in pixels.
    </ToolHead>
    <div className="st-tracker">
      <div className="st-tracker-media">
        {src ? <video ref={videoRef} src={src} controls muted playsInline onLoadedMetadata={e => setMeta({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight, d: e.currentTarget.duration })} />
          : <EmptyState icon={Upload} title="No footage loaded">Nothing is analysed until you provide a real video file. Files never leave your computer.</EmptyState>}
        <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />
        <label className="s-btn s-btn-ghost s-btn-sm" style={{ marginTop: 10 }}><Upload size={14} /> {src ? 'Load another file' : 'Load video file'}
          <input type="file" accept="video/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) { setRun({ busy: false, progress: 0, rows: [] }); setName(f.name); setSrc(URL.createObjectURL(f)); } }} /></label>
        {meta && <p className="s-muted">{name} · {meta.w}×{meta.h}px · {meta.d.toFixed(1)} s · analysed at 240 px width (1 analysis px ≈ {(meta.w / 240).toFixed(1)} source px)</p>}
      </div>
      <div className="st-tracker-controls">
        <label className="s-field"><span>Intensity threshold: {threshold}</span><input className="s-range" type="range" min="30" max="240" value={threshold} onChange={e => setThreshold(+e.target.value)} /></label>
        <label className="s-field"><span>Sample every</span><select className="s-select" value={step} onChange={e => setStep(+e.target.value)}>{[0.1, 0.25, 0.5, 1].map(s => <option key={s} value={s}>{s} s</option>)}</select></label>
        <label className="s-field"><span>Track edge</span><select className="s-select" value={edge} onChange={e => setEdge(e.target.value)}><option value="right">Right-most bright pixels (98th pct.)</option><option value="left">Left-most bright pixels (2nd pct.)</option><option value="cx">Centroid x</option></select></label>
        <label className="s-field"><span>Calibration (px per mm, optional)</span><input className="s-input" type="number" min="0" step="0.01" value={pxPerMm} onChange={e => setPxPerMm(e.target.value)} placeholder="Measure a known length in the footage" /></label>
        <div className="s-row">
          <button type="button" className="s-btn s-btn-primary" disabled={!meta || run.busy} onClick={analyse}>{run.busy ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />} {run.busy ? `Analysing ${Math.round(run.progress * 100)}%` : 'Analyse footage'}</button>
          {run.busy && <button type="button" className="s-btn s-btn-ghost" onClick={() => { abort.current = true; }}>Stop</button>}
        </div>
        {run.busy && <div className="s-bar-track"><div className="s-bar-fill" style={{ transform: `scaleX(${run.progress})` }} /></div>}
      </div>
    </div>
    {chart && <div className="st-track-result s-tabpanel">
      <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="st-track-chart" role="img" aria-label="Tracked edge position over time with threshold sensitivity band">
        <polygon points={chart.band} fill="#1679c2" opacity=".14" />
        <polyline points={chart.line} fill="none" stroke="#1679c2" strokeWidth="2" />
        <line x1={chart.P} y1={chart.H - chart.P} x2={chart.W - 8} y2={chart.H - chart.P} stroke="#c9dbe8" />
        <text x={chart.P} y={chart.H - 10} className="st-axis">0 s</text><text x={chart.W - 8} y={chart.H - 10} textAnchor="end" className="st-axis">{chart.t1.toFixed(1)} s</text>
        <text x={4} y={14} className="st-axis">{chart.hi.toFixed(0)} px</text><text x={4} y={chart.H - chart.P} className="st-axis">{chart.lo.toFixed(0)} px</text>
      </svg>
      <div className="st-track-stats">
        <div><span className="s-label">Samples with a bright region</span><strong>{run.rows.length}</strong></div>
        <div><span className="s-label">Mean threshold band width</span><strong>±{(run.rows.reduce((s, r) => s + (r.hi - r.lo) / 2, 0) / run.rows.length).toFixed(1)} px</strong></div>
        <div><span className="s-label">Linear edge drift</span><strong>{fit ? `${fit.slope.toFixed(1)} ± ${(2 * fit.se).toFixed(1)} px/s` : '—'}</strong>
          {fit && cal && <small>{(fit.slope / cal).toFixed(2)} ± {(2 * fit.se / cal).toFixed(2)} mm/s using <em>your</em> calibration</small>}</div>
      </div>
      <div className="s-alert"><AlertTriangle size={17} /><span>Edge positions track pixel brightness, not a verified flame front. The band shows sensitivity to a ±25 threshold change plus 1 analysis-pixel quantisation; ± on drift is ~2 standard errors of a straight-line fit. Camera exposure, glare, overlays and perspective are not corrected. {cal ? 'Physical units rely entirely on the calibration you entered.' : 'No calibration: values are pixels, not physical distances or speeds.'}</span></div>
      <button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={exportCsv}><Download size={14} /> Export tracking CSV</button>
    </div>}
  </div>;
}

/* ------------------------------------------------------------ 06 What-if */
export function WhatIfTool() {
  const list = useApi((o) => getExperiments({ limit: 500, ...o }), []);
  const { experiments, setExperiments } = useResearch();
  const records = list.data?.items || [];
  const [base, setBase] = useState(experiments[0] || 'B1');
  const [change, setChange] = useState('oxygen');
  const [value, setValue] = useState('17');
  const [out, setOut] = useState({ data: null, loading: false, error: null });
  const baseRec = records.find(r => r.id === base);
  const options = useMemo(() => ({
    flow: [...new Set(records.map(r => r.flow_restrictor).filter(Boolean))].sort(),
    material: ['PMMA (explicit)', 'SIBAL (explicit)', 'Nomex (explicit)', 'Wax (explicit)', 'Other descriptions'],
  }), [records]);
  useEffect(() => { if (change === 'material') setValue('SIBAL (explicit)'); if (change === 'flow_setting') setValue(options.flow[0] || ''); if (change === 'oxygen') setValue('17'); }, [change]); // eslint-disable-line
  async function runIt(e) {
    e?.preventDefault();
    setOut({ data: null, loading: true, error: null });
    try { setOut({ data: await api.whatIf({ base, change, value }), loading: false, error: null }); } catch (error) { setOut({ data: null, loading: false, error }); }
  }
  return <div className="research-panel st-panel">
    <ToolHead number="06" title="What-If Experiment Comparator" badge={<EvidenceBadge kind="measured">Observational lookup</EvidenceBadge>}>
      Change one recorded condition of a real BASS-II test and see which tests were actually run that way. This replaces prediction with observation: SOLARIS never manufactures an outcome for an experiment that was not performed.
    </ToolHead>
    {list.loading ? <Skeleton lines={3} /> : list.error ? <ApiError error={list.error} onRetry={list.reload} /> :
      <form className="st-whatif" onSubmit={runIt}>
        <label className="s-field"><span>Base experiment</span><select className="s-select" value={base} onChange={e => setBase(e.target.value)}>{records.map(r => <option key={r.id} value={r.id}>{r.id} — {r.fuel || 'Material not reported'}</option>)}</select></label>
        <label className="s-field"><span>What if…</span><select className="s-select" value={change} onChange={e => setChange(e.target.value)}><option value="oxygen">initial O₂ were different</option><option value="material">the material were different</option><option value="flow_setting">the flow-restrictor setting were different</option></select></label>
        <label className="s-field"><span>Changed to</span>{change === 'oxygen' ? <input className="s-input" type="number" step="0.1" min="0" max="100" value={value} onChange={e => setValue(e.target.value)} />
          : <select className="s-select" value={value} onChange={e => setValue(e.target.value)}>{(change === 'material' ? options.material : options.flow).map(v => <option key={v} value={v}>{v}</option>)}</select>}</label>
        <button className="s-btn s-btn-primary" type="submit" disabled={out.loading}>{out.loading ? <LoaderCircle size={15} className="spin" /> : <FlaskConical size={15} />} Find tested cases</button>
        {baseRec && <p className="s-muted st-base">Base: {baseRec.fuel} · initial O₂ {baseRec.initial_oxygen_pct ?? 'n/r'}% · flow restrictor {baseRec.flow_restrictor || 'n/r'} (raw)</p>}
      </form>}
    {out.error && <ApiError error={out.error} />}
    {out.data && <div className="s-tabpanel" key={JSON.stringify([base, change, value])}>
      <div className={`st-verdict ${out.data.matches.length ? 'st-no_contradiction_detected' : 'st-insufficient_statements'}`}><FlaskConical size={18} /><div><strong>{out.data.criteria}</strong><small>{out.data.interpretation}</small></div></div>
      {out.data.matches.length > 0 && <div className="s-table-wrap" style={{ marginTop: 12 }}><table className="s-table"><thead><tr><th>Test</th><th>Fuel (verbatim)</th><th>Initial O₂</th><th>Flow restr. (raw)</th><th /></tr></thead>
        <tbody>{out.data.matches.slice(0, 30).map(m => <tr key={m.id}><td><strong>{m.id}</strong></td><td>{m.fuel}</td><td>{m.initial_oxygen_pct ?? 'n/r'}</td><td>{m.flow_restrictor || 'n/r'}</td>
          <td><button type="button" className="s-btn s-btn-quiet s-btn-sm" onClick={() => { setExperiments([base, m.id]); window.location.hash = '/theater'; }}>Compare with {base}</button></td></tr>)}</tbody></table></div>}
    </div>}
  </div>;
}

/* ------------------------------------------------------------ 07 Advisor */
export function AdvisorTool() {
  const r = useApi((o) => api.nextExperiments(o), []);
  return <div className="research-panel st-panel">
    <ToolHead number="07" title="Next-Best-Experiment Advisor" badge={<EvidenceBadge kind="model">Research-planning hypotheses</EvidenceBadge>}>
      Informative next questions derived from gaps and single-replicate cells in the evidence SOLARIS holds. Each idea shows the exact coverage pattern that motivated it.
    </ToolHead>
    {r.loading ? <Skeleton lines={6} /> : r.error ? <ApiError error={r.error} onRetry={r.reload} /> : <>
      <div className="s-alert is-info"><Lightbulb size={17} /><span>{r.data.disclaimer}</span></div>
      <div className="st-ideas" data-reveal-group>{r.data.ideas.map((idea, i) => <article key={i} className="s-card st-idea" data-reveal>
        <span className="s-label">{idea.kind.replaceAll('_', ' ')}{idea.material_group ? ` · ${idea.material_group}` : ''}</span>
        <h3 className="s-h3">{idea.question}</h3>
        <p className="s-muted">{idea.rationale}</p>
        <div className="cp-ids">{Object.entries(idea.evidence).map(([k, v]) => <span key={k} className="s-chip">{k.replaceAll('_', ' ')}: {Array.isArray(v) ? v.map(x => typeof x === 'number' ? `${x}%` : x).join(', ') : String(v)}</span>)}</div>
      </article>)}</div>
    </>}
  </div>;
}
