import React, { useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, CircleDashed, Info, ShieldAlert, Wind } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { useResearch } from '../state/ResearchContext.jsx';
import { ApiError, EvidenceBadge, PageHeader, Skeleton, Tabs } from '../components/ui.jsx';

/* Illustrative geometry only — not engineering drawings of any real vehicle. */
const HABITATS = {
  station: {
    label: 'Space station module', gravity: 'Microgravity (orbital free fall)', g: '≈ 0 g effective', evidence: true,
    note: 'Closest to the conditions of the ISS and Cygnus experiments in SOLARIS.',
    zones: [
      { id: 'quarters', label: 'Crew quarters', shape: { x: 60, y: 70, w: 150, h: 110 } },
      { id: 'galley', label: 'Galley', shape: { x: 225, y: 70, w: 150, h: 110 } },
      { id: 'lab', label: 'Experiment racks', shape: { x: 390, y: 70, w: 200, h: 110 } },
      { id: 'stowage', label: 'Stowage', shape: { x: 60, y: 200, w: 260, h: 90 } },
      { id: 'airlock', label: 'Hatch / node', shape: { x: 335, y: 200, w: 255, h: 90 } },
    ],
    outline: 'M40 50 H610 Q640 50 640 80 V280 Q640 310 610 310 H40 Q10 310 10 280 V80 Q10 50 40 50 Z',
  },
  moon: {
    label: 'Lunar surface habitat (concept)', gravity: 'Partial gravity ≈ 0.17 g (1.62 m/s²)', g: '≈ 0.17 g', evidence: false,
    note: 'Buoyancy exists but is weaker than on Earth. SOLARIS holds no partial-gravity combustion data.',
    zones: [
      { id: 'quarters', label: 'Crew quarters', shape: { x: 120, y: 80, w: 170, h: 100 } },
      { id: 'galley', label: 'Galley', shape: { x: 310, y: 80, w: 170, h: 100 } },
      { id: 'lab', label: 'Lab / workshop', shape: { x: 120, y: 195, w: 170, h: 95 } },
      { id: 'stowage', label: 'Stowage', shape: { x: 310, y: 195, w: 170, h: 95 } },
      { id: 'airlock', label: 'Airlock', shape: { x: 500, y: 150, w: 110, h: 80 } },
    ],
    outline: 'M100 300 V120 Q100 50 300 50 Q500 50 500 120 V300 Z M500 140 H620 V240 H500',
  },
  mars: {
    label: 'Mars surface habitat (concept)', gravity: 'Partial gravity ≈ 0.38 g (3.71 m/s²)', g: '≈ 0.38 g', evidence: false,
    note: 'Different gravity and, depending on design, different cabin atmosphere. SOLARIS holds no data for these conditions.',
    zones: [
      { id: 'quarters', label: 'Crew quarters', shape: { x: 70, y: 90, w: 160, h: 90 } },
      { id: 'galley', label: 'Galley', shape: { x: 245, y: 90, w: 160, h: 90 } },
      { id: 'lab', label: 'Lab / greenhouse', shape: { x: 420, y: 90, w: 170, h: 90 } },
      { id: 'stowage', label: 'Stowage', shape: { x: 70, y: 195, w: 250, h: 90 } },
      { id: 'airlock', label: 'Suit port / airlock', shape: { x: 335, y: 195, w: 255, h: 90 } },
    ],
    outline: 'M50 70 Q330 20 610 70 V300 H50 Z',
  },
};
const MATERIALS = {
  pmma: { label: 'PMMA (acrylic)', group: 'PMMA (explicit)', key: 'pmma' },
  sibal: { label: 'SIBAL cotton-fiberglass fabric', group: 'SIBAL (explicit)', key: 'sibal' },
  nomex: { label: 'Nomex', group: 'Nomex (explicit)', key: 'nomex' },
  other: { label: 'A material not in SOLARIS', group: null, key: null },
};
const VENT = {
  active: { label: 'Ventilation running', note: 'An imposed airflow supplies oxygen where buoyancy cannot.' },
  low: { label: 'Reduced flow', note: 'Sources report flame behaviour changes at low flow speeds; see quotes.' },
  off: { label: 'Ventilation off', note: 'In microgravity, little or no flow means transport is mostly by diffusion.' },
};

function Check({ ok, children }) {
  return <li className={ok ? 'is-ok' : 'is-missing'}>{ok ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}<span>{children}</span></li>;
}

export default function Habitat() {
  const { material: savedMat, setMaterial } = useResearch();
  const [hab, setHab] = useState('station');
  const [zone, setZone] = useState('quarters');
  const [mat, setMat] = useState(MATERIALS[savedMat] ? savedMat : 'sibal');
  const [vent, setVent] = useState('low');
  const gaps = useApi((o) => api.gaps(o), []);
  const fnd = useApi((o) => api.findings(o), []);
  const H = HABITATS[hab];
  const M = MATERIALS[mat];
  const rows = gaps.data?.material_groups.find(g => g.group === M.group)?.count || 0;
  const matFindings = useMemo(() => (fnd.data?.items || []).filter(f => M.key && f.materials.includes(M.key)), [fnd.data, M.key]);
  const flowFindings = useMemo(() => (fnd.data?.items || []).filter(f => f.concepts.includes('flow') || f.concepts.includes('extinction')), [fnd.data]);
  const zoneLabel = H.zones.find(z => z.id === zone)?.label;

  return <div className="s-page">
    <PageHeader kicker="Discover / Space Habitat Safety Explorer" title={<>What does the evidence say <em>about this cabin?</em></>}
      lede="Pick a habitat, a zone, a material and a ventilation state. SOLARIS shows which NASA evidence is relevant and — just as importantly — what is missing. This is an evidence-exploration tool, not a safety simulator: there are no ignition probabilities or risk scores here." />
    <div className="container hb-layout">
      <section className="s-panel hb-stage" data-reveal>
        <div className="s-row" style={{ justifyContent: 'space-between' }}>
          <Tabs label="Habitat" value={hab} onChange={(v) => { setHab(v); setZone('quarters'); }} tabs={Object.entries(HABITATS).map(([value, h]) => ({ value, label: h.label.split(' (')[0] }))} />
          <EvidenceBadge kind="illustration">Illustrative layout</EvidenceBadge>
        </div>
        <svg viewBox="0 0 650 340" className="hb-svg" role="group" aria-label={`${H.label} — select a zone`} key={hab}>
          <defs><pattern id="hb-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#dbe8f2" strokeWidth="1" /></pattern></defs>
          <rect width="650" height="340" fill="url(#hb-grid)" />
          <path d={H.outline} fill="#f8fbfe" stroke="#9cc3df" strokeWidth="2.5" className="hb-outline" />
          {H.zones.map((z, i) => {
            const s = z.shape; const sel = zone === z.id;
            return <g key={z.id} className={`hb-zone ${sel ? 'is-sel' : ''}`} style={{ '--i': i }} tabIndex={0} role="button" aria-pressed={sel} aria-label={z.label}
              onClick={() => setZone(z.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZone(z.id); } }}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="10" />
              <text x={s.x + 12} y={s.y + 24}>{z.label}</text>
              {sel && vent !== 'off' && <g className="hb-flow">{[0, 1, 2].map(k => <path key={k} d={`M${s.x + 14} ${s.y + 45 + k * 16} h${s.w - 40}`} />)}</g>}
            </g>;
          })}
          <text x="20" y="330" className="hb-caption">NOT TO SCALE · NOT A REAL VEHICLE LAYOUT · {H.g}</text>
        </svg>
        <div className="hb-controls">
          <label className="s-field"><span>Material</span><select className="s-select" value={mat} onChange={e => { setMat(e.target.value); setMaterial(e.target.value); }}>{Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></label>
          <div className="s-field"><span>Ventilation (qualitative)</span><div className="hb-vent" role="radiogroup" aria-label="Ventilation">{Object.entries(VENT).map(([k, v]) => <button key={k} type="button" role="radio" aria-checked={vent === k} className="s-chip" aria-pressed={vent === k} onClick={() => setVent(k)}><Wind size={12} /> {v.label}</button>)}</div></div>
        </div>
      </section>

      <aside className="hb-side">
        {gaps.loading || fnd.loading ? <div className="s-panel"><Skeleton lines={8} /></div> : gaps.error || fnd.error ? <ApiError error={gaps.error || fnd.error} onRetry={() => { gaps.reload(); fnd.reload(); }} /> : <>
          <div className="s-panel hb-summary s-tabpanel" key={`${hab}${zone}${mat}${vent}`}>
            <span className="s-label">{H.label} · {zoneLabel}</span>
            <h3 className="s-h3" style={{ marginTop: 6 }}>{M.label} with {VENT[vent].label.toLowerCase()}</h3>
            <ul className="hb-checks">
              <Check ok={H.evidence}>{H.evidence ? 'Gravity regime matches the microgravity experiments in SOLARIS.' : `${H.gravity}: no SOLARIS dataset or finding was recorded in this regime.`}</Check>
              <Check ok={rows > 0}>{rows > 0 ? `${rows} BASS-II row(s) name this material.` : 'No imported experimental rows for this material.'}</Check>
              <Check ok={matFindings.length > 0}>{matFindings.length ? `${matFindings.length} verbatim NASA finding(s) concern this material.` : 'No verified finding in SOLARIS concerns this material.'}</Check>
              <Check ok={false}>Zone-specific evidence ({zoneLabel}): none. Zones are illustrative; no experiment reproduced a cabin layout.</Check>
            </ul>
            <p className="s-muted">{H.note} {VENT[vent].note}</p>
          </div>
          {matFindings.length > 0 && <div className="s-panel"><span className="s-label">Material evidence</span>
            {matFindings.map(f => <figure key={f.id} className="st-quote"><blockquote>“{f.quote}”</blockquote><figcaption>{f.source.identifier} — {f.locator}</figcaption></figure>)}</div>}
          {vent !== 'active' && <div className="s-panel"><span className="s-label">Flow & extinction evidence (tested configurations only)</span>
            {flowFindings.slice(0, 3).map(f => <figure key={f.id} className="st-quote"><blockquote>“{f.quote}”</blockquote><figcaption>{f.source.identifier} — {f.locator}</figcaption></figure>)}
            <p className="s-muted" style={{ marginTop: 8 }}>These statements describe the experiments’ own geometries and flows. Whether they apply to a {zoneLabel?.toLowerCase()} is not established.</p></div>}
          <div className="s-alert"><ShieldAlert size={17} /><span>Not a certified engineering assessment. Material selection for real spacecraft follows NASA standards and validated testing that SOLARIS does not reproduce.</span></div>
          <div className="s-row"><a className="s-btn s-btn-ghost s-btn-sm" href="#/research?tool=safety">Earth-to-Space transfer tool <ArrowUpRight size={13} /></a><a className="s-btn s-btn-ghost s-btn-sm" href="#/research?tool=gaps">Evidence gaps <ArrowUpRight size={13} /></a><a className="s-btn s-btn-quiet s-btn-sm" href="#/library"><Info size={13} /> Saffire in the Library</a></div>
        </>}
      </aside>
    </div>
  </div>;
}
