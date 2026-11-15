/**
 * Habitat Safety Explorer additions (merged from SOLARIS 4.0 MissionShield):
 *  - SourceTableEvidence: which rows of the NASA PSI source tables relate to the chosen habitat question (literal retrieval).
 *  - TracerSandbox: a verified, mass-conserving 2-D passive-tracer transport calculation with ventilation on/off (conceptual).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Database, Waves } from 'lucide-react';
import { tablesApi, useApi } from '../../lib/api.js';
import { ApiError, EvidenceBadge, Skeleton } from '../../components/ui.jsx';
import { atlasHref } from '../studio/SourceTableTools.jsx';

const ENV = { station: 'orbital', moon: 'lunar', mars: 'martian' };
const TERM = { pmma: 'PMMA', sibal: 'SIBAL', nomex: 'Nomex', other: '' };
const TOPICS = [['solid-materials', 'Solid materials (BASS, Saffire)'], ['droplets', 'Droplets (FLEX)'], ['gas-flames', 'Gas flames (ACME, SPICE)'], ['smoke', 'Smoke & soot (SAME, SPICE)']];

export function SourceTableEvidence({ hab, mat, vent }) {
  const [topic, setTopic] = useState('solid-materials');
  const [term, setTerm] = useState(TERM[mat] ?? '');
  useEffect(() => { setTerm(TERM[mat] ?? ''); }, [mat]);
  const body = { environment: ENV[hab] ?? 'orbital', topic, source_term: topic === 'solid-materials' ? term : '', ventilation: vent === 'off' ? 'off' : 'on', oxygen_percent: null };
  const r = useApi((o) => tablesApi.scenario(body, o), [JSON.stringify(body)]);
  return <section className="s-panel hb-extra" aria-labelledby="hb-src-title" data-reveal>
    <div className="s-row" style={{ justifyContent: 'space-between' }}>
      <div><span className="s-label"><Database size={12} /> NASA source tables</span><h3 id="hb-src-title" className="s-h3" style={{ marginTop: 6 }}>Which table rows relate to this question?</h3></div>
      <EvidenceBadge kind="measured">Literal match in source cells</EvidenceBadge>
    </div>
    <p className="s-muted">Searches the PSI experimental tables indexed under a topic for the material name as written. A match means the word appears in a row — not that the row tested this cabin, this zone or this ventilation.</p>
    <div className="s-row" role="group" aria-label="Topic">{TOPICS.map(([id, label]) => <button key={id} type="button" className="s-chip" aria-pressed={topic === id} onClick={() => setTopic(id)}>{label}</button>)}</div>
    {topic === 'solid-materials' && <label className="s-field" style={{ marginTop: 12, maxWidth: 360 }}><span>Material text to find</span><input className="s-input" value={term} maxLength={80} onChange={e => setTerm(e.target.value)} placeholder="e.g. PMMA" /></label>}
    {r.loading ? <Skeleton lines={4} style={{ marginTop: 12 }} /> : r.error ? <ApiError error={r.error} onRetry={r.reload} what="source-table evidence" /> : <div className="s-tabpanel" key={JSON.stringify(body)}>
      <p className="hb-count"><strong>{r.data.matching_source_rows_total}</strong> of {r.data.candidate_source_rows_total} source-record rows in {r.data.datasets.length} table(s) {body.source_term ? <>contain “{body.source_term}”</> : 'are indexed under this topic'}.</p>
      <ul className="hb-tables">{r.data.datasets.map(d => <li key={d.dataset_id}>
        <div><strong>{d.investigation}</strong><small>{d.candidate_rows} matching · {d.source_rows} rows in table</small></div>
        <div className="s-row">{d.sample_evidence.map(s => <a key={s.record_id} className="s-chip" href={atlasHref(d.dataset_id, s.source_row)}>row {s.source_row}</a>)}
          <a className="s-btn s-btn-quiet s-btn-sm" href={atlasHref(d.dataset_id)}>Open table <ArrowUpRight size={12} /></a></div></li>)}</ul>
      <p className="s-muted">{r.data.environment_note} {r.data.interpretation}</p>
      <details className="cf-assume"><summary>Limitations of this retrieval</summary><ul>{r.data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></details>
    </div>}
  </section>;
}

function Heatmap({ grid, max }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c || !grid) return;
    const H = grid.length, W = grid[0].length, g = c.getContext('2d'); if (!g) return;
    c.width = W; c.height = H; const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const f = Math.max(0, Math.min(1, grid[y][x] / (max || 1))), p = (y * W + x) * 4;
      img.data[p] = 6 + f * 80; img.data[p + 1] = 22 + f * 180; img.data[p + 2] = 38 + f * 200; img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, [grid, max]);
  return <canvas ref={ref} className="hb-heat" role="img" aria-label="Tracer concentration on the periodic 2-D grid" />;
}

export function TracerSandbox({ vent }) {
  const [ventilation, setVentilation] = useState(vent === 'off' ? 'off' : 'on');
  const [steps, setSteps] = useState(80);
  useEffect(() => { setVentilation(vent === 'off' ? 'off' : 'on'); }, [vent]);
  const init = useApi((o) => tablesApi.transport('off', 1, o), []);
  const r = useApi((o) => tablesApi.transport(ventilation, steps, o), [ventilation, steps]);
  const max = init.data?.max_value;
  return <section className="s-panel hb-extra" aria-labelledby="hb-tr-title" data-reveal>
    <div className="s-row" style={{ justifyContent: 'space-between' }}>
      <div><span className="s-label"><Waves size={12} /> Transport sandbox</span><h3 id="hb-tr-title" className="s-h3" style={{ marginTop: 6 }}>How a passive tracer spreads with and without flow</h3></div>
      <EvidenceBadge kind="simulation">Conceptual simulation · dimensionless</EvidenceBadge>
    </div>
    <p className="s-muted">A verified advection–diffusion calculation of a non-reacting tracer (think of a puff of smoke) on a periodic grid. Ventilation switches a prescribed shear flow on or off. It shows why flow matters for transport; it is not a habitat airflow model, not a fire, and not a smoke-detector prediction.</p>
    <div className="hb-tr-grid">
      <div className="hb-tr-view">{r.data ? <Heatmap grid={r.data.grid} max={max} /> : <div className="s-skeleton" style={{ aspectRatio: '32 / 22' }} />}
        <div className="hb-tr-scale"><span>0</span><i /><span>initial peak</span></div></div>
      <div className="hb-tr-side">
        <div className="s-field"><span>Prescribed flow</span><div className="s-row" role="radiogroup" aria-label="Prescribed flow">{[['on', 'Ventilation on'], ['off', 'Ventilation off']].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={ventilation === k} className="s-chip" aria-pressed={ventilation === k} onClick={() => setVentilation(k)}>{l}</button>)}</div></div>
        <label className="s-field"><span>Elapsed steps: {steps} ({(steps * 0.05).toFixed(1)} reference time units)</span><input className="s-range" type="range" min="1" max="240" step="1" value={steps} onChange={e => setSteps(+e.target.value)} /></label>
        {r.error ? <ApiError error={r.error} onRetry={r.reload} what="the transport calculation" /> : r.data && <dl className="hb-tr-facts">
          <div><dt>Mass conservation error</dt><dd>{r.data.relative_mass_error.toExponential(1)}</dd></div>
          <div><dt>Peak concentration</dt><dd>{(r.data.max_value / (max || 1) * 100).toFixed(0)} % of initial</dd></div>
          <div><dt>Stability number (CFL)</dt><dd>{r.data.cfl_ratio.toFixed(2)} ≤ 1</dd></div>
          <div><dt>Status</dt><dd>{r.data.status.replaceAll('_', ' ')}</dd></div>
        </dl>}
      </div>
    </div>
    {r.data && <details className="cf-assume"><summary>Model, assumptions & limits</summary><p>{r.data.model}. Units: {r.data.units}.</p><ul>{r.data.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
  </section>;
}
