import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, FileDown, FileText, FileVideo, GitCompareArrows, Pause, Play, RotateCcw, Upload, Info } from 'lucide-react';
import { api, compareExperiments, getExperiments, useApi } from '../lib/api.js';
import { useResearch } from '../state/ResearchContext.jsx';
import { ApiError, EmptyState, EvidenceBadge, PageHeader, Skeleton } from '../components/ui.jsx';

const SPEEDS = [0.25, 0.5, 1, 2];
const fmt = (t) => Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 10))}` : '—';
const show = (v) => v === null || v === undefined || String(v).trim() === '' ? 'Not reported' : String(v);

function MediaStage({ side, recordId, record, videoRef, src, onFile, onMeta }) {
  const media = useApi((o) => recordId ? api.media(recordId, o) : Promise.resolve(null), [recordId]);
  const inputId = `file-${side}`;
  return <div className="th-stage">
    <div className="th-stage-head">
      <span className="th-side">{side}</span>
      <div><strong>Test {recordId || '—'}</strong><small>{record?.fuel || 'Select an experiment'}</small></div>
    </div>
    <div className="th-screen">
      {src ? <video ref={videoRef} src={src} muted playsInline preload="metadata" onLoadedMetadata={onMeta} aria-label={`User-loaded footage for test ${recordId}`} />
        : <div className="th-screen-empty">
          <FileVideo size={30} strokeWidth={1.4} />
          {media.loading ? <span>Checking NASA PSI listings…</span>
            : media.data?.files?.length ? <>
              <strong>{media.data.files.length} NASA file(s) listed for {recordId}</strong>
              <ul>{media.data.files.slice(0, 3).map(f => <li key={f.file_name}><code>{f.file_name.replace('PSI-25_Raw Data_', '')}</code><small>{f.kind === 'still_sequence' ? 'still sequence' : 'video'} · {(f.size_bytes / 1e6).toFixed(1)} MB</small></li>)}</ul>
              <p>Download a file from the PSI repository, then load it here. SOLARIS never substitutes generated footage.</p>
            </> : <>
              <strong>No footage listed for this test</strong>
              <p>PSI lists no video file whose name matches test {recordId}. The conditions comparison below still works.</p>
            </>}
        </div>}
    </div>
    <div className="th-stage-actions">
      <label htmlFor={inputId} className="s-btn s-btn-ghost s-btn-sm"><Upload size={14} /> {src ? 'Replace file' : 'Load local video'}</label>
      <input id={inputId} type="file" accept="video/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      {media.data?.psi_url && <a className="s-btn s-btn-quiet s-btn-sm" href={media.data.psi_url} target="_blank" rel="noopener noreferrer">PSI-25 repository <ArrowUpRight size={13} /></a>}
    </div>
  </div>;
}

export default function Theater() {
  const { experiments, setExperiments } = useResearch();
  const list = useApi((o) => getExperiments({ limit: 500, ...o }), []);
  const records = list.data?.items || [];
  const ids = new Set(records.map(r => r.id));
  const [a, b] = [experiments[0] && ids.has(experiments[0]) ? experiments[0] : records[0]?.id, experiments[1] && ids.has(experiments[1]) ? experiments[1] : records[1]?.id];
  const recA = records.find(r => r.id === a);
  const recB = records.find(r => r.id === b);

  const [cmp, setCmp] = useState({ data: null, error: null, loading: false });
  useEffect(() => {
    if (!a || !b || a === b) { setCmp({ data: null, error: null, loading: false }); return undefined; }
    const ctrl = new AbortController();
    setCmp(s => ({ ...s, loading: true, error: null }));
    compareExperiments({ firstId: a, secondId: b, signal: ctrl.signal })
      .then(data => setCmp({ data, error: null, loading: false }))
      .catch(error => { if (error.name !== 'AbortError') setCmp({ data: null, error, loading: false }); });
    return () => ctrl.abort();
  }, [a, b]);

  // ---- synchronized playback (user-supplied files only) ----
  const vA = useRef(null), vB = useRef(null);
  const [srcA, setSrcA] = useState(null), [srcB, setSrcB] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [offset, setOffset] = useState(0);
  const [durations, setDurations] = useState({ A: 0, B: 0 });
  useEffect(() => () => { if (srcA) URL.revokeObjectURL(srcA); }, [srcA]);
  useEffect(() => () => { if (srcB) URL.revokeObjectURL(srcB); }, [srcB]);
  const videos = () => [vA.current, vB.current].filter(Boolean);
  const duration = Math.max(durations.A, durations.B - offset, 0);

  useEffect(() => { videos().forEach(v => { v.playbackRate = speed; }); }, [speed, srcA, srcB]);
  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = () => { if (vA.current) setTime(vA.current.currentTime); else if (vB.current) setTime(vB.current.currentTime - offset); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, offset]);

  function seek(t) {
    setTime(t);
    if (vA.current) vA.current.currentTime = Math.max(0, t);
    if (vB.current) vB.current.currentTime = Math.max(0, t + offset);
  }
  async function toggle() {
    if (!videos().length) return;
    if (playing) { videos().forEach(v => v.pause()); setPlaying(false); return; }
    seek(time);
    await Promise.allSettled(videos().map(v => v.play()));
    setPlaying(true);
  }
  function onKey(e) {
    if (e.target.closest('select,input,textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.key === 'ArrowRight') seek(Math.min(duration, time + 0.5));
    if (e.key === 'ArrowLeft') seek(Math.max(0, time - 0.5));
  }
  function load(side, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPlaying(false);
    side === 'A' ? setSrcA(url) : setSrcB(url);
  }
  function select(side, id) {
    setPlaying(false); setSrcA(null); setSrcB(null); setTime(0);
    setExperiments(side === 'A' ? [id, b] : [a, id]);
  }

  const warnings = useMemo(() => {
    if (!cmp.data) return [];
    const f = Object.fromEntries(cmp.data.fields.map(x => [x.key, x]));
    const w = [];
    if (f.fuel_family?.status !== 'match') w.push('The explicit material identity is not the same (or not stated) for both tests. Material differences alone can change combustion behaviour; treat any side-by-side reading as qualitative.');
    if (f.thickness_um?.status === 'different') w.push('Stated sample thickness differs. Thickness is known to affect spread behaviour, so footage is not directly comparable.');
    if (cmp.data.comparison.unknown) w.push(`${cmp.data.comparison.unknown} field(s) are unknown for at least one test — comparability cannot be confirmed.`);
    w.push('Air and fan displays are raw readings; equal readings do not establish equal airflow.');
    return w;
  }, [cmp.data]);

  return <div className="s-page" onKeyDown={onKey}>
    <PageHeader kicker="Research / Flame Comparison Theater" title={<>Two experiments. <em>One honest comparison.</em></>}
      lede="Select two BASS-II tests, inspect their recorded conditions, and play NASA footage you have downloaded side by side with synchronized controls. Numbers come only from the NASA table; unsupported numeric comparisons stay disabled." />
    <div className="container">
      {list.loading ? <div className="s-panel"><Skeleton lines={5} /></div>
        : list.error ? <ApiError error={list.error} onRetry={list.reload} what="BASS-II experiments" />
        : <>
          <div className="th-selector s-panel" data-reveal>
            <label className="s-field"><span>Experiment A</span>
              <select className="s-select" value={a || ''} onChange={e => select('A', e.target.value)}>
                {records.map(r => <option key={r.id} value={r.id}>{r.id} — {r.fuel || 'Material not reported'}</option>)}</select></label>
            <div className="th-vs" aria-hidden="true"><GitCompareArrows size={20} /></div>
            <label className="s-field"><span>Experiment B</span>
              <select className="s-select" value={b || ''} onChange={e => select('B', e.target.value)}>
                {records.map(r => <option key={r.id} value={r.id}>{r.id} — {r.fuel || 'Material not reported'}</option>)}</select></label>
          </div>
          {a === b && <div className="s-alert" style={{ marginTop: 12 }}><AlertTriangle size={18} />Choose two different tests.</div>}

          <section className="th-theater" aria-label="Synchronized footage" data-reveal>
            <div className="th-stages">
              <MediaStage side="A" recordId={a} record={recA} videoRef={vA} src={srcA} onFile={f => load('A', f)} onMeta={e => setDurations(d => ({ ...d, A: e.currentTarget.duration }))} />
              <MediaStage side="B" recordId={b} record={recB} videoRef={vB} src={srcB} onFile={f => load('B', f)} onMeta={e => setDurations(d => ({ ...d, B: e.currentTarget.duration }))} />
            </div>
            <div className="th-transport" aria-label="Playback controls">
              <button type="button" className="th-play" onClick={toggle} disabled={!srcA && !srcB} aria-label={playing ? 'Pause both' : 'Play both'}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
              <span className="th-time">{fmt(time)} / {fmt(duration)}</span>
              <input className="s-range th-scrub" type="range" min="0" max={duration || 0} step="0.05" value={Math.min(time, duration || 0)} disabled={!duration} onChange={e => seek(Number(e.target.value))} aria-label="Timeline position" />
              <div className="th-speeds" role="group" aria-label="Playback speed">{SPEEDS.map(s => <button key={s} type="button" className="s-chip" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
              <label className="th-offset"><span>B offset</span><input className="s-input" type="number" step="0.1" value={offset} onChange={e => setOffset(Number(e.target.value) || 0)} aria-label="Offset of video B in seconds" /><small>s</small></label>
              <button type="button" className="s-btn s-btn-quiet s-btn-sm" onClick={() => { setPlaying(false); videos().forEach(v => v.pause()); seek(0); }}><RotateCcw size={14} /> Reset</button>
            </div>
            <p className="th-note"><Info size={14} /> Offset lets you align, for example, ignition frames by eye. Frame times are not calibrated measurements. Space = play/pause, ← → = step 0.5 s.</p>
          </section>

          <section className="th-results" aria-live="polite">
            {cmp.loading ? <div className="s-panel"><Skeleton lines={6} /></div>
              : cmp.error ? <ApiError error={cmp.error} what="the comparison" />
              : !cmp.data ? <EmptyState icon={GitCompareArrows} title="Select two tests to compare" />
              : <div className="th-grid">
                <div className="s-panel" data-reveal>
                  <div className="s-row" style={{ justifyContent: 'space-between' }}><span className="s-label">Recorded conditions</span><span className="s-muted">{a} / {b}</span></div>
                  <div className="s-table-wrap" style={{ marginTop: 12 }}>
                    <table className="s-table">
                      <thead><tr><th scope="col">Field</th><th scope="col">{a}</th><th scope="col">{b}</th><th scope="col">Status</th></tr></thead>
                      <tbody>{cmp.data.fields.map(f => <tr key={f.key}>
                        <th scope="row"><div style={{ fontWeight: 800, color: 'var(--s-ink)' }}>{f.label}</div><EvidenceBadge apiKind={f.value_kind} /></th>
                        <td>{show(f.first_value)}</td><td>{show(f.second_value)}</td>
                        <td><span className={`th-status th-${f.status}`}>{f.status === 'match' ? 'Same' : f.status === 'different' ? 'Differs' : 'Unknown'}</span></td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                  <div className="th-disabled">
                    <span className="s-label">Numeric comparisons</span>
                    <button type="button" className="s-btn s-btn-ghost s-btn-sm" disabled aria-disabled="true">Flame-spread rate Δ</button>
                    <button type="button" className="s-btn s-btn-ghost s-btn-sm" disabled aria-disabled="true">Airflow Δ (cm/s)</button>
                    <p className="s-muted">Disabled: the BASS-II table has no spread-rate measurements and no calibrated flow speeds.</p>
                  </div>
                </div>
                <aside className="s-stack">
                  <div className="s-panel th-summary" data-reveal>
                    <span className="s-label">Comparison summary</span>
                    <EvidenceBadge kind="metadata">Rule-based SOLARIS interpretation</EvidenceBadge>
                    <h3 className="s-h3" style={{ marginTop: 10 }}>{cmp.data.comparison.matches} same · {cmp.data.comparison.differences} differ · {cmp.data.comparison.unknown} unknown</h3>
                    <p className="s-muted">{cmp.data.summary}</p>
                    {cmp.data.fields.filter(f => f.status === 'different').length > 0 && <ul className="th-diff">
                      {cmp.data.fields.filter(f => f.status === 'different').map(f => <li key={f.key}><strong>{f.label}:</strong> {show(f.first_value)} → {show(f.second_value)}</li>)}
                    </ul>}
                    <div className="s-row" style={{ marginTop: 12 }}>
                      <a className="s-btn s-btn-primary s-btn-sm" href="#/report"><FileDown size={14} /> Build PDF report</a>
                      <a className="s-btn s-btn-ghost s-btn-sm" href="#/copilot">Ask Copilot</a>
                    </div>
                  </div>
                  <div className="s-panel" data-reveal>
                    <span className="s-label">Comparability warnings</span>
                    <ul className="th-warn">{warnings.map((w, i) => <li key={i}><AlertTriangle size={14} />{w}</li>)}</ul>
                  </div>
                  <details className="s-panel th-passport" data-reveal>
                    <summary><FileText size={15} /> Evidence Passport</summary>
                    <dl>
                      <div><dt>Source</dt><dd>{cmp.data.evidence_passport.source_dataset}</dd></div>
                      <div><dt>Records</dt><dd>{cmp.data.evidence_passport.record_ids.join(' · ')}</dd></div>
                      <div><dt>Method</dt><dd>{cmp.data.evidence_passport.methodology} ({cmp.data.method_version})</dd></div>
                      <div><dt>Status</dt><dd>{cmp.data.evidence_passport.status}</dd></div>
                    </dl>
                    <ul>{cmp.data.evidence_passport.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
                    <a className="s-btn s-btn-quiet s-btn-sm" href={cmp.data.evidence_passport.source_url} target="_blank" rel="noopener noreferrer">NASA PSI-25 <ArrowUpRight size={13} /></a>
                  </details>
                </aside>
              </div>}
          </section>
        </>}
    </div>
  </div>;
}
