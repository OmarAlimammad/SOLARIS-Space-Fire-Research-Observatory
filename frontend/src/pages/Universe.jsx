import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Focus, List, Minus, Network, Plus, Search, X } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { ApiError, EmptyState, PageHeader, Skeleton, Tabs } from '../components/ui.jsx';
import { useResearch } from '../state/ResearchContext.jsx';
import { prefersReducedMotion } from '../lib/motion.js';

const TYPES = {
  investigation: { label: 'Investigations', color: '#1679c2', r: 15 },
  hardware: { label: 'Hardware', color: '#5d7286', r: 9 },
  material: { label: 'Materials', color: '#c8861a', r: 10 },
  finding: { label: 'Published findings', color: '#2b9a8f', r: 7 },
  concept: { label: 'Concepts', color: '#6b5bd2', r: 9 },
  gap: { label: 'Evidence gaps', color: '#9aa9b6', r: 9 },
};
const BASIS = {
  source_metadata: { label: 'NASA record / release', dash: '' },
  experimental_data: { label: 'Counted from BASS-II table', dash: '' },
  published_source: { label: 'Quoted NASA document', dash: '' },
  curated_tag: { label: 'SOLARIS curation tag', dash: '4 4' },
  absence: { label: 'Missing evidence', dash: '2 5' },
};
const W = 1100, H = 720;

/** Deterministic force layout (seeded), computed once. */
function layout(nodes, edges) {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const typeRing = { investigation: 0.18, hardware: 0.42, material: 0.38, finding: 0.33, concept: 0.4, gap: 0.46 };
  const pos = new Map(nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 + rand() * 0.5;
    const ring = (typeRing[n.type] ?? 0.35) * Math.min(W, H);
    return [n.id, { x: W / 2 + Math.cos(a) * ring, y: H / 2 + Math.sin(a) * ring, vx: 0, vy: 0 }];
  }));
  const links = edges.map(e => [pos.get(e.source), pos.get(e.target)]).filter(([a, b]) => a && b);
  const arr = [...pos.values()];
  for (let it = 0; it < 320; it++) {
    const alpha = 1 - it / 320;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy || 0.01;
      const f = 1600 / d2 * alpha; const d = Math.sqrt(d2);
      a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
    }
    for (const [a, b] of links) {
      const dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 70) * 0.02 * alpha;
      a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
    }
    for (const p of arr) {
      p.vx += (W / 2 - p.x) * 0.004 * alpha; p.vy += (H / 2 - p.y) * 0.004 * alpha;
      p.x += Math.max(-12, Math.min(12, p.vx)); p.y += Math.max(-12, Math.min(12, p.vy));
      p.vx *= 0.55; p.vy *= 0.55;
      p.x = Math.max(30, Math.min(W - 30, p.x)); p.y = Math.max(30, Math.min(H - 30, p.y));
    }
  }
  return pos;
}

function Details({ node, graph, onSelect }) {
  const { setInvestigation } = useResearch();
  if (!node) return <div className="uv-details-empty"><Focus size={22} /><strong>Select a node</strong><p>Every connection shows where it comes from — a NASA record, the BASS-II table, a quoted document, or a SOLARIS curation tag.</p></div>;
  const rel = graph.edges.filter(e => e.source === node.id || e.target === node.id);
  const byId = Object.fromEntries(graph.nodes.map(n => [n.id, n]));
  return <div className="uv-details">
    <span className="uv-type" style={{ '--c': TYPES[node.type]?.color }}>{TYPES[node.type]?.label.replace(/s$/, '')}</span>
    <h3 className="s-h3">{node.type === 'finding' ? 'Published finding' : node.label}</h3>
    {node.title && <p className="s-muted">{node.title}{node.accessions ? ` · ${node.accessions.join(', ')}` : ''}</p>}
    {node.quote && <blockquote className="uv-quote">“{node.quote}”<cite>{node.source.identifier} — {node.locator}</cite></blockquote>}
    {node.data_level && <p className="s-muted">Data in SOLARIS: <strong>{node.data_level === 'row_level_imported' ? 'row-level table imported' : 'catalog metadata only'}</strong></p>}
    <div className="s-row" style={{ margin: '10px 0' }}>
      {node.url && <a className="s-btn s-btn-ghost s-btn-sm" href={node.url} target="_blank" rel="noopener noreferrer">Official source <ArrowUpRight size={13} /></a>}
      {node.source?.url && <a className="s-btn s-btn-ghost s-btn-sm" href={node.source.url} target="_blank" rel="noopener noreferrer">NASA document <ArrowUpRight size={13} /></a>}
      {node.type === 'investigation' && <a className="s-btn s-btn-primary s-btn-sm" href="#/library" onClick={() => setInvestigation(node.id.slice(4))}>Open in Library</a>}
      {node.id === 'inv:bass-ii' && <a className="s-btn s-btn-ghost s-btn-sm" href="#/explore">Data Atlas</a>}
    </div>
    <span className="s-label">{rel.length} relationship(s)</span>
    <ul className="uv-rel">{rel.map(e => {
      const other = byId[e.source === node.id ? e.target : e.source];
      return <li key={e.id}>
        <button type="button" onClick={() => onSelect(other.id)}><i style={{ background: TYPES[other.type]?.color }} />{other.type === 'finding' ? other.label : other.label}</button>
        <small><b>{e.relation.replaceAll('_', ' ')}</b> · {BASIS[e.basis_kind]?.label}: {e.basis}{e.url && <> · <a href={e.url} target="_blank" rel="noopener noreferrer">source</a></>}</small>
      </li>;
    })}</ul>
  </div>;
}

export default function Universe() {
  const g = useApi((o) => api.graph(o), []);
  const [view, setView] = useState('graph');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState(new Set());
  const [hiddenBasis, setHiddenBasis] = useState(new Set());
  const [tf, setTf] = useState({ k: 1, x: 0, y: 0 });
  const svgRef = useRef(null);
  const drag = useRef(null);
  const [ready, setReady] = useState(false);

  const pos = useMemo(() => g.data ? layout(g.data.nodes, g.data.edges) : null, [g.data]);
  useEffect(() => { if (pos) { const t = setTimeout(() => setReady(true), prefersReducedMotion() ? 0 : 30); return () => clearTimeout(t); } return undefined; }, [pos]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => new Set(g.data && q ? g.data.nodes.filter(n => `${n.label} ${n.quote || ''} ${n.title || ''}`.toLowerCase().includes(q)).map(n => n.id) : []), [g.data, q]);
  const neighbours = useMemo(() => {
    if (!g.data || !selected) return null;
    const s = new Set([selected]);
    g.data.edges.forEach(e => { if (e.source === selected) s.add(e.target); if (e.target === selected) s.add(e.source); });
    return s;
  }, [g.data, selected]);

  function onWheel(e) {
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * W, my = (e.clientY - rect.top) / rect.height * H;
    setTf(t => { const k = Math.max(0.5, Math.min(3, t.k * (e.deltaY < 0 ? 1.12 : 0.89))); return { k, x: mx - (mx - t.x) * (k / t.k), y: my - (my - t.y) * (k / t.k) }; });
  }
  useEffect(() => {
    const el = svgRef.current; if (!el) return undefined;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const zoom = (f) => setTf(t => { const k = Math.max(0.5, Math.min(3, t.k * f)); return { k, x: W / 2 - (W / 2 - t.x) * (k / t.k), y: H / 2 - (H / 2 - t.y) * (k / t.k) }; });
  const toggle = (set, setter, key) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setter(n); };
  const selNode = g.data?.nodes.find(n => n.id === selected);

  return <div className="s-page">
    <PageHeader kicker="Research / NASA Evidence Universe" title={<>A map of what is known — <em>and how we know it.</em></>}
      lede="Investigations, hardware, materials, quoted findings, concepts and evidence gaps. Every edge has a defined meaning and a stated basis; dashed edges are SOLARIS curation, dotted edges mark missing evidence. Nothing is inferred from similarity." />
    <div className="container">
      {g.loading ? <div className="s-panel"><Skeleton lines={8} height={18} /></div>
        : g.error ? <ApiError error={g.error} onRetry={g.reload} what="the evidence graph" />
        : <>
          <div className="uv-toolbar" data-reveal>
            <label className="uv-search"><Search size={16} /><span className="sr-only">Search nodes</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search: PMMA, extinction, FLEX…" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</label>
            <div className="uv-filters" role="group" aria-label="Node types">{Object.entries(TYPES).map(([k, t]) => <button key={k} type="button" className="s-chip" aria-pressed={!hidden.has(k)} onClick={() => toggle(hidden, setHidden, k)} style={{ '--dot': t.color }}><i className="uv-dot" />{t.label}</button>)}</div>
            <Tabs label="View" value={view} onChange={setView} tabs={[{ value: 'graph', label: 'Graph', icon: <Network size={14} /> }, { value: 'list', label: 'List', icon: <List size={14} /> }]} />
          </div>
          <div className="uv-layout">
            {view === 'graph' ? <div className="uv-canvas s-tabpanel" data-reveal="fade">
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evidence knowledge graph. Use the list view for a keyboard-accessible version."
                onPointerDown={e => { if (e.target === svgRef.current || e.target.dataset.bg) drag.current = { x: e.clientX, y: e.clientY, tx: tf.x, ty: tf.y }; }}
                onPointerMove={e => { if (!drag.current) return; const r = svgRef.current.getBoundingClientRect(); setTf(t => ({ ...t, x: drag.current.tx + (e.clientX - drag.current.x) * W / r.width, y: drag.current.ty + (e.clientY - drag.current.y) * H / r.height })); }}
                onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
                <rect width={W} height={H} fill="transparent" data-bg="1" />
                <g transform={`translate(${tf.x} ${tf.y}) scale(${tf.k})`} className={`uv-world ${ready ? 'is-ready' : ''}`}>
                  {g.data.edges.map(e => {
                    const a = pos.get(e.source), b = pos.get(e.target);
                    const sn = g.data.nodes.find(n => n.id === e.source), tn = g.data.nodes.find(n => n.id === e.target);
                    if (!a || !b || hidden.has(sn.type) || hidden.has(tn.type) || hiddenBasis.has(e.basis_kind)) return null;
                    const dim = neighbours && !(neighbours.has(e.source) && neighbours.has(e.target));
                    return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`uv-edge ${dim ? 'is-dim' : ''} ${neighbours && !dim ? 'is-hot' : ''}`} strokeDasharray={BASIS[e.basis_kind]?.dash} />;
                  })}
                  {g.data.nodes.map((n, i) => {
                    const p = pos.get(n.id); if (hidden.has(n.type)) return null;
                    const t = TYPES[n.type] || TYPES.concept;
                    const r = t.r + Math.min(6, n.degree * 0.35);
                    const dim = (neighbours && !neighbours.has(n.id)) || (q && !matches.has(n.id));
                    return <g key={n.id} transform={`translate(${p.x} ${p.y})`} className={`uv-node ${dim ? 'is-dim' : ''} ${selected === n.id ? 'is-sel' : ''} ${q && matches.has(n.id) ? 'is-match' : ''}`}
                      style={{ '--i': i }} onClick={() => setSelected(n.id === selected ? null : n.id)}>
                      <circle r={r + 5} className="uv-halo" fill={t.color} />
                      <circle r={r} fill={n.type === 'gap' ? '#fff' : t.color} stroke={t.color} strokeWidth={n.type === 'gap' ? 2 : 0} strokeDasharray={n.type === 'gap' ? '3 3' : undefined} />
                      {(n.type !== 'finding' || selected === n.id) && <text y={r + 13} textAnchor="middle">{n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}</text>}
                      <title>{n.type === 'finding' ? n.quote : n.label}</title>
                    </g>;
                  })}
                </g>
              </svg>
              <div className="uv-zoom"><button type="button" onClick={() => zoom(1.2)} aria-label="Zoom in"><Plus size={16} /></button><button type="button" onClick={() => zoom(0.83)} aria-label="Zoom out"><Minus size={16} /></button><button type="button" onClick={() => setTf({ k: 1, x: 0, y: 0 })} aria-label="Reset view"><Focus size={15} /></button></div>
              <div className="uv-legend">{Object.entries(BASIS).map(([k, b]) => <button key={k} type="button" aria-pressed={!hiddenBasis.has(k)} onClick={() => toggle(hiddenBasis, setHiddenBasis, k)}><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#6d8aa0" strokeWidth="2" strokeDasharray={b.dash} /></svg>{b.label}</button>)}</div>
            </div>
              : <div className="uv-list s-panel s-tabpanel">
                {Object.entries(TYPES).filter(([k]) => !hidden.has(k)).map(([k, t]) => {
                  const ns = g.data.nodes.filter(n => n.type === k && (!q || matches.has(n.id)));
                  if (!ns.length) return null;
                  return <section key={k}><h3 className="s-label" style={{ color: t.color }}>{t.label} ({ns.length})</h3>
                    <ul>{ns.map(n => <li key={n.id}><button type="button" className={selected === n.id ? 'is-sel' : ''} onClick={() => setSelected(n.id)}>{n.type === 'finding' ? n.quote.slice(0, 120) + '…' : n.label}<small>{n.degree} links</small></button></li>)}</ul></section>;
                })}
                {q && !matches.size && <EmptyState title="No matching nodes">Try a broader term.</EmptyState>}
              </div>}
            <aside className="uv-side s-panel" aria-live="polite"><Details node={selNode} graph={g.data} onSelect={setSelected} /></aside>
          </div>
          <p className="s-muted" style={{ marginTop: 12 }}>{g.data.nodes.length} nodes · {g.data.edges.length} edges. Layout positions carry no meaning; only edges do.</p>
        </>}
    </div>
  </div>;
}
