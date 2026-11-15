import React, { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarClock, Database, FileText, Rocket } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { useResearch } from '../state/ResearchContext.jsx';
import { ApiError, EvidenceBadge, PageHeader, Skeleton, Tabs } from '../components/ui.jsx';

const KIND = {
  operations: { label: 'Operations', icon: Rocket, ev: 'metadata' },
  publication: { label: 'Publications', icon: FileText, ev: 'finding' },
  data: { label: 'Dataset dates', icon: Database, ev: 'measured' },
};
const fmtDate = (d, p) => {
  const [y, m, day] = d.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (p === 'year' || !m) return y;
  if (p === 'month' || !day) return `${months[+m - 1]} ${y}`;
  return `${+day} ${months[+m - 1]} ${y}`;
};
const parsePsi = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || ''); return m ? +m[3] + (+m[1] - 1) / 12 : null; };

export default function Timeline() {
  const t = useApi((o) => api.timeline(o), []);
  const f = useApi((o) => api.findings(o), []);
  const { setInvestigation, setExperiments } = useResearch();
  const [kind, setKind] = useState('all');
  const [open, setOpen] = useState(null);
  const events = useMemo(() => (t.data?.events || []).filter(e => kind === 'all' || e.kind === kind), [t.data, kind]);
  const findingById = useMemo(() => Object.fromEntries((f.data?.items || []).map(x => [x.id, x])), [f.data]);
  const ranges = useMemo(() => {
    if (!t.data) return null;
    const rows = t.data.psi_record_ranges.flatMap(i => i.records.map(r => ({ name: i.name, acc: r.accession, s: parsePsi(r.start), e: parsePsi(r.end) }))).filter(r => r.s);
    const min = Math.floor(Math.min(...rows.map(r => r.s))), max = Math.ceil(Math.max(...rows.map(r => r.e || r.s)));
    return { rows, min, max };
  }, [t.data]);
  let lastYear = null;

  return <div className="s-page">
    <PageHeader kicker="Discover / Combustion Discovery Timeline" title={<>Milestones, <em>dated by their sources.</em></>}
      lede="Every milestone carries the NASA document that dates it and states how precise the date is. Dataset dates come straight from the BASS-II table. Undated or unverified events are left out rather than guessed." />
    <div className="container">
      <div className="uv-toolbar" data-reveal><Tabs label="Event type" value={kind} onChange={setKind} tabs={[{ value: 'all', label: 'All' }, ...Object.entries(KIND).map(([value, k]) => ({ value, label: k.label }))]} /></div>
      {t.loading ? <Skeleton lines={10} height={18} /> : t.error ? <ApiError error={t.error} onRetry={t.reload} what="the timeline" /> : <>
        <ol className="tl-list" key={kind}>
          {events.map((e, i) => {
            const K = KIND[e.kind] || KIND.operations; const Icon = K.icon;
            const year = e.date.slice(0, 4); const showYear = year !== lastYear; lastYear = year;
            const finding = e.finding_id ? findingById[e.finding_id] : null;
            const isOpen = open === e.id;
            return <li key={e.id} className={`tl-item ${isOpen ? 'is-open' : ''}`} data-reveal style={{ '--reveal-i': Math.min(i, 6) }}>
              <div className="tl-year">{showYear ? year : ''}</div>
              <div className="tl-dot"><Icon size={14} /></div>
              <div className="tl-card s-card">
                <button type="button" className="tl-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                  <span className="tl-date">{fmtDate(e.date, e.precision)} <small>{e.precision} precision</small></span>
                  <strong>{e.title}</strong>
                  <span className="tl-meta"><span className="s-chip">{e.investigation.toUpperCase()}</span><EvidenceBadge kind={K.ev}>{K.label}</EvidenceBadge></span>
                </button>
                <div className="tl-body" hidden={!isOpen}>
                  <p>{e.summary}</p>
                  {e.precision_note && <p className="s-muted">{e.precision_note}</p>}
                  {finding && <figure className="st-quote"><blockquote>“{finding.quote}”</blockquote><figcaption>{finding.source.identifier} — {finding.locator}</figcaption></figure>}
                  {e.record_ids && <div className="cp-ids">{e.record_ids.slice(0, 30).map(id => <span key={id} className="s-chip">{id}</span>)}{e.record_ids.length > 30 && <span className="s-chip">+{e.record_ids.length - 30}</span>}</div>}
                  <div className="s-row" style={{ marginTop: 10 }}>
                    <a className="s-btn s-btn-ghost s-btn-sm" href={e.source.url} target="_blank" rel="noopener noreferrer">{e.source.label} <ArrowUpRight size={13} /></a>
                    <a className="s-btn s-btn-quiet s-btn-sm" href="#/library" onClick={() => setInvestigation(e.investigation)}>Investigation in Library</a>
                    {e.record_ids && e.record_ids.length >= 2 && <a className="s-btn s-btn-quiet s-btn-sm" href="#/theater" onClick={() => setExperiments(e.record_ids.slice(0, 2))}>Compare two of these tests</a>}
                  </div>
                </div>
              </div>
            </li>;
          })}
        </ol>
        {ranges && <section className="tl-ranges s-panel" data-reveal>
          <div className="s-row" style={{ justifyContent: 'space-between' }}><div><span className="s-label"><CalendarClock size={13} /> NASA PSI record date ranges</span><h3 className="s-h3" style={{ marginTop: 6 }}>Repository / programme dates — not flight dates</h3></div><EvidenceBadge kind="metadata">As listed by PSI</EvidenceBadge></div>
          <p className="s-muted">{t.data.notes[1]} Some ranges (for example Saffire-I) start years before the flight and should not be read as operations.</p>
          <div className="tl-gantt">
            <div className="tl-axis">{Array.from({ length: Math.floor((ranges.max - ranges.min) / 4) + 1 }, (_, i) => ranges.min + i * 4).map(y => <span key={y} style={{ left: `${(y - ranges.min) / (ranges.max - ranges.min) * 100}%` }}>{y}</span>)}</div>
            {ranges.rows.map(r => <div key={r.acc} className="tl-bar-row"><span className="tl-bar-label">{r.name} <small>{r.acc}</small></span>
              <div className="tl-bar-track"><div className={`tl-bar ${r.e ? '' : 'is-open-ended'}`} style={{ left: `${(r.s - ranges.min) / (ranges.max - ranges.min) * 100}%`, width: `${Math.max(1, ((r.e || r.s + 0.5) - r.s) / (ranges.max - ranges.min) * 100)}%` }} /></div></div>)}
          </div>
        </section>}
      </>}
    </div>
  </div>;
}
