import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileDown, FileText, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { api, getExperiments, useApi } from '../lib/api.js';
import { useResearch } from '../state/ResearchContext.jsx';
import { ApiError, EvidenceBadge, PageHeader, Skeleton } from '../components/ui.jsx';
import RunLedger from '../features/sim/RunLedger.jsx';

const SECTIONS = [
  ['Evidence classes', 'How every value in the report is labelled', 'metadata'],
  ['Investigation details', 'PSI accession, DOI, hardware, data status, quoted objective', 'metadata'],
  ['Selected experiments', 'Verbatim rows from the NASA BASS-II table', 'measured'],
  ['Recorded-conditions comparison', 'Field-by-field match / differ / unknown (needs two records)', 'metadata'],
  ['Dataset chart', 'Rows per explicit material group, computed from the table', 'measured'],
  ['Published findings', 'Verbatim NASA quotes with locators', 'finding'],
  ['Evidence Passport', 'Source file hash, locators, methods, limitations, sources', 'metadata'],
];

export default function Report() {
  const research = useResearch();
  const list = useApi((o) => getExperiments({ limit: 500, ...o }), []);
  const invs = useApi((o) => api.investigations(o), []);
  const [question, setQuestion] = useState(research.question || '');
  const [ids, setIds] = useState(research.experiments);
  const [investigation, setInvestigation] = useState(research.investigation || 'bass-ii');
  const [includeFindings, setIncludeFindings] = useState(true);
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState('');
  const [status, setStatus] = useState({ loading: false, error: null, done: null });
  const records = list.data?.items || [];
  const known = useMemo(() => new Set(records.map(r => r.id)), [records]);

  function add() {
    if (adding && known.has(adding) && !ids.includes(adding) && ids.length < 12) setIds([...ids, adding]);
    setAdding('');
  }
  async function generate(e) {
    e.preventDefault();
    setStatus({ loading: true, error: null, done: null });
    try {
      const blob = await api.report({ question: question || 'Recorded-conditions report', record_ids: ids, investigation, include_findings: includeFindings, notes });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
      a.href = url; a.download = `SOLARIS_report_${stamp}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus({ loading: false, error: null, done: { size: blob.size, at: new Date() } });
      research.setQuestion(question);
      research.setExperiments(ids.slice(0, 2));
    } catch (error) {
      setStatus({ loading: false, error, done: null });
    }
  }

  return <div className="s-page">
    <PageHeader kicker="Research / One-Click Scientific Report" title={<>From selection to <em>reproducible PDF.</em></>}
      lede="The report is generated on the server from the data SOLARIS actually holds. Every table and chart is computed from the NASA BASS-II file, whose SHA-256 hash is printed in the Evidence Passport so anyone can check the input." />
    <div className="container rp-layout">
      <form className="s-panel rp-form" onSubmit={generate} data-reveal>
        <label className="s-field"><span>Research question</span>
          <input className="s-input" value={question} maxLength={300} onChange={e => setQuestion(e.target.value)} placeholder="e.g. How do the recorded conditions of B1 and B2 differ?" /></label>
        <label className="s-field"><span>Investigation context</span>
          {invs.loading ? <div className="s-skeleton" style={{ height: 40 }} /> : <select className="s-select" value={investigation} onChange={e => setInvestigation(e.target.value)}>
            {(invs.data?.items || [{ id: 'bass-ii', name: 'BASS-II' }]).map(i => <option key={i.id} value={i.id}>{i.name}{i.title ? ` — ${i.title}` : ''}</option>)}</select>}
        </label>
        <div className="s-field"><span>BASS-II experiments ({ids.length}/12)</span>
          <div className="rp-ids">{ids.length ? ids.map(id => <span key={id} className="s-chip">{id}<button type="button" onClick={() => setIds(ids.filter(x => x !== id))} aria-label={`Remove ${id}`}><X size={12} /></button></span>) : <span className="s-muted">No experiments selected — the report will cover the investigation and dataset only.</span>}</div>
          {list.loading ? <Skeleton lines={1} height={38} /> : list.error ? <ApiError error={list.error} what="experiments" /> :
            <div className="s-row"><select className="s-select" style={{ flex: 1 }} value={adding} onChange={e => setAdding(e.target.value)} aria-label="Add experiment">
              <option value="">Add an experiment…</option>
              {records.filter(r => !ids.includes(r.id)).map(r => <option key={r.id} value={r.id}>{r.id} — {r.fuel || 'Material not reported'}</option>)}
            </select><button type="button" className="s-btn s-btn-ghost" onClick={add} disabled={!adding}>Add</button></div>}
          <small className="s-muted">The first two selected experiments are compared field by field.</small>
        </div>
        <label className="rp-check"><input type="checkbox" checked={includeFindings} onChange={e => setIncludeFindings(e.target.checked)} /> Include verbatim NASA findings for this investigation</label>
        <label className="s-field"><span>Researcher notes (optional, printed as unverified)</span>
          <textarea className="s-textarea" maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <button className="s-btn s-btn-primary" type="submit" disabled={status.loading} style={{ justifySelf: 'start' }}>
          {status.loading ? <LoaderCircle size={16} className="spin" /> : <FileDown size={16} />} {status.loading ? 'Generating PDF…' : 'Generate PDF report'}</button>
        {status.error && <ApiError error={status.error} what="the report" />}
        {status.done && <div className="s-alert is-info" role="status"><CheckCircle2 size={18} /><span>Report downloaded ({(status.done.size / 1024).toFixed(0)} KB) at {status.done.at.toLocaleTimeString()}.</span></div>}
      </form>
      <aside className="s-stack">
        <div className="rp-paper" data-reveal aria-label="Report outline preview">
          <div className="rp-paper-top"><FileText size={16} /> SOLARIS · SCIENTIFIC REPORT</div>
          <h3>{question || 'Recorded-conditions report'}</h3>
          <p className="s-muted">{investigation.toUpperCase()} · {ids.length ? ids.join(', ') : 'no experiments'} · generated on request</p>
          <ol>{SECTIONS.filter(([t]) => (includeFindings || t !== 'Published findings') && (ids.length >= 2 || t !== 'Recorded-conditions comparison') && (ids.length || t !== 'Selected experiments'))
            .map(([t, d, k]) => <li key={t}><div><strong>{t}</strong><small>{d}</small></div><EvidenceBadge kind={k} /></li>)}</ol>
        </div>
        <div className="s-panel" data-reveal><span className="s-label"><ShieldCheck size={13} /> What the report will not contain</span>
          <ul className="rp-not"><li>Flame-spread rates or calibrated airflow speeds (not in the table)</li><li>Risk scores, probabilities or safety certification</li><li>AI-generated text</li></ul></div>
      </aside>
    </div>
    <div className="container rp-runs" data-reveal>
      <RunLedger compact />
    </div>
  </div>;
}
