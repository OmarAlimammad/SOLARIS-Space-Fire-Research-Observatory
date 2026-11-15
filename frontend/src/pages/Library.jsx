import React, { useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, Database, ExternalLink, FileText, Layers, Search, X } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { useResearch } from '../state/ResearchContext.jsx';
import { ApiError, EmptyState, EvidenceBadge, PageHeader, Skeleton, Tabs } from '../components/ui.jsx';

/**
 * NASA Research Library — investigation catalog built from the public NASA PSI metadata snapshot.
 * Teammate integration point: this page may be replaced by the team's Library module
 * (keep the default export and route path).
 */
const PHASES = { all: 'All', solid: 'Solid fuels', liquid: 'Liquid droplets', gas: 'Gaseous flames', smoke: 'Smoke' };

function Detail({ id, onClose }) {
  const d = useApi((o) => api.investigation(id, o), [id]);
  const [tab, setTab] = useState('overview');
  const [pubQ, setPubQ] = useState('');
  return <div className="s-dialog-backdrop" onClick={onClose}>
    <div className="s-dialog lb-dialog" role="dialog" aria-modal="true" aria-labelledby="lb-title" onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <button type="button" className="lb-close" onClick={onClose} aria-label="Close" autoFocus><X size={18} /></button>
      {d.loading ? <Skeleton lines={8} /> : d.error ? <ApiError error={d.error} onRetry={d.reload} /> : <>
        <span className="s-label">{d.data.accessions.join(' · ')} · {d.data.profile.venue}</span>
        <h2 id="lb-title" className="lb-title">{d.data.name} <small>{d.data.title}</small></h2>
        <div className="s-row" style={{ margin: '8px 0 14px' }}>
          <span className={`st-level ${d.data.data_status.level}`}>{d.data.data_status.label}</span>
          {d.data.doi && <a className="s-chip" href={`https://doi.org/${d.data.doi}`} target="_blank" rel="noopener noreferrer">DOI {d.data.doi}</a>}
        </div>
        <Tabs label="Investigation details" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'findings', label: `Findings (${d.data.findings.length})` }, { value: 'pubs', label: `Publications (${d.data.publication_count})` }, { value: 'data', label: 'Data & files' }]} />
        <div className="s-tabpanel lb-tab" key={tab}>
          {tab === 'overview' && d.data.psi_records.map(r => <section key={r.accession} className="lb-record">
            {d.data.psi_records.length > 1 && <h3 className="s-h3">{r.acronym} — {r.title}</h3>}
            {['objective', 'hypothesis', 'approach', 'researchImpacts'].filter(k => r.text[k]).map(k => <div key={k} className="lb-text">
              <span className="s-label">{k === 'researchImpacts' ? 'Research impacts' : k}</span><p>{r.text[k]}</p></div>)}
            <p className="s-muted">Quoted from NASA PSI record {r.accession}. People: {r.people.map(p => `${p.name}${p.roles.length ? ` (${p.roles.join(', ')})` : ''}`).join('; ') || 'not listed'}.</p>
          </section>)}
          {tab === 'findings' && (d.data.findings.length ? d.data.findings.map(f => <figure key={f.id} className="st-quote lb-finding"><blockquote>“{f.quote}”</blockquote><figcaption>{f.source.identifier} — {f.locator} · <a href={f.source.url} target="_blank" rel="noopener noreferrer">source</a></figcaption></figure>)
            : <EmptyState icon={FileText} title="No verified quotation yet">SOLARIS only lists findings it has string-matched against a NASA document. The publications tab lists papers recorded by PSI.</EmptyState>)}
          {tab === 'pubs' && <>
            <label className="uv-search" style={{ maxWidth: 'none', marginBottom: 10 }}><Search size={15} /><input value={pubQ} onChange={e => setPubQ(e.target.value)} placeholder="Filter publications…" aria-label="Filter publications" /></label>
            <ol className="lb-pubs">{d.data.psi_records.flatMap(r => r.publications.map((p, i) => ({ ...p, key: `${r.accession}-${i}` })))
              .filter(p => !pubQ || `${p.title} ${p.authors}`.toLowerCase().includes(pubQ.toLowerCase()))
              .map(p => <li key={p.key}><strong>{p.title}</strong><small>{p.authors}</small>{p.doi && <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer">doi:{p.doi} <ArrowUpRight size={11} /></a>}</li>)}</ol>
            <p className="s-muted">As listed on the NASA PSI record(s). Titles have not been individually reviewed by SOLARIS.</p>
          </>}
          {tab === 'data' && <div className="s-stack">
            <p className="lb-note">{d.data.data_status.note}</p>
            {d.data.psi_records.map(r => <div key={r.accession} className="lb-files">
              <strong>{r.accession}</strong>
              <div className="cp-ids">{r.experimental_tables.map(t => <span key={t.file_name} className="s-chip"><Database size={11} /> {t.file_name} · {(t.size_bytes / 1024).toFixed(1)} KB</span>)}</div>
              <div className="cp-ids">{Object.entries(r.file_inventory.by_category).map(([k, v]) => <span key={k} className="s-chip">{k}: {v}</span>)}</div>
              <small className="s-muted">PSI record dates (not flight dates): {r.psi_record_start_date || '—'} → {r.psi_record_end_date || '—'} · licence {r.license || 'not stated'}</small>
            </div>)}
            <div className="s-row">
              <a className="s-btn s-btn-primary s-btn-sm" href={d.data.psi_url} target="_blank" rel="noopener noreferrer">Open on NASA PSI <ExternalLink size={13} /></a>
              {d.data.id === 'bass-ii' && <a className="s-btn s-btn-ghost s-btn-sm" href="#/explore" onClick={onClose}>Explore rows in Data Atlas</a>}
            </div>
          </div>}
        </div>
      </>}
    </div>
  </div>;
}

export default function Library() {
  const r = useApi((o) => api.investigations(o), []);
  const { investigation, setInvestigation } = useResearch();
  const [phase, setPhase] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const items = useMemo(() => (r.data?.items || []).filter(i => (phase === 'all' || i.profile.fuel_phase === phase) && (!q || `${i.name} ${i.title} ${i.summary} ${i.hardware}`.toLowerCase().includes(q.toLowerCase()))), [r.data, phase, q]);

  return <div className="s-page">
    <PageHeader kicker="NASA Research Library" title={<>Eleven investigations. <em>One honest catalog.</em></>}
      lede="Each card is built from the public NASA Physical Sciences Informatics record: accession, DOI, hardware, objectives and listed publications. The badge tells you exactly how much of each investigation’s data SOLARIS holds."
      aside={r.data && <div className="lb-summary"><div><strong>{r.data.items.length}</strong><span>investigations</span></div><div><strong>{r.data.items.filter(i => i.data_status.level === 'row_level_imported').length}</strong><span>with imported rows</span></div><div><strong>{r.data.items.reduce((s, i) => s + i.publication_count, 0)}</strong><span>listed publications</span></div></div>} />
    <div className="container">
      <div className="uv-toolbar" data-reveal>
        <label className="uv-search"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search investigations…" aria-label="Search investigations" /></label>
        <Tabs label="Fuel phase" value={phase} onChange={setPhase} tabs={Object.entries(PHASES).map(([value, label]) => ({ value, label }))} />
      </div>
      {r.loading ? <div className="lb-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="s-card" style={{ padding: 22 }}><Skeleton lines={5} /></div>)}</div>
        : r.error ? <ApiError error={r.error} onRetry={r.reload} what="the investigation catalog" />
        : !items.length ? <EmptyState icon={BookOpen} title="No investigations match">Clear the search or choose another fuel phase.</EmptyState>
        : <div className="lb-grid" data-reveal-group key={phase + q}>{items.map(i => <article key={i.id} data-reveal className={`s-card is-interactive lb-card ${investigation === i.id ? 'is-selected' : ''}`}
          tabIndex={0} role="button" aria-label={`Open ${i.name}`} onClick={() => { setInvestigation(i.id); setOpen(i.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInvestigation(i.id); setOpen(i.id); } }}>
          <div className="lb-card-top"><span className="lb-acc">{i.accessions.join(' · ')}</span><span className={`st-level ${i.data_status.level}`}>{i.data_status.level === 'row_level_imported' ? `${i.data_status.imported_rows} rows imported` : 'Catalog only'}</span></div>
          <h3>{i.name}</h3>
          <p className="lb-card-title">{i.title}</p>
          <p className="lb-card-sum">{i.summary}</p>
          <div className="lb-card-meta"><span><Layers size={13} /> {i.profile.configuration}</span><span><FileText size={13} /> {i.publication_count} publications · {i.finding_ids.length} verified quotes</span></div>
          <div className="lb-card-foot"><EvidenceBadge kind="metadata">NASA PSI record</EvidenceBadge><span className="lb-open">Open <ArrowUpRight size={14} /></span></div>
        </article>)}</div>}
      {r.data && <p className="s-muted" style={{ marginTop: 16 }}>Metadata snapshot retrieved {new Date(r.data.retrieved_utc).toLocaleString()} from {r.data.source}. {r.data.notes[0]}</p>}
    </div>
    {open && <Detail id={open} onClose={() => setOpen(null)} />}
  </div>;
}
