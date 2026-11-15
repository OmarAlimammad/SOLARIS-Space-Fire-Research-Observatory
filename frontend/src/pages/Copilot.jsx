import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bot, BookOpenText, CornerDownLeft, Database, LoaderCircle, MessageSquareText, Search, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { api, useApi } from '../lib/api.js';
import { useResearch } from '../state/ResearchContext.jsx';
import { ApiError, EmptyState, EvidenceBadge, PageHeader } from '../components/ui.jsx';

const EXAMPLES = [
  'Why does combustion behave differently in microgravity?',
  'What does BASS-II investigate?',
  'Which available experiments involve PMMA?',
  'What does the SPICE table record about smoke points?',
  'How do B1 and B2 differ?',
  'What evidence exists that flammability limits differ in reduced gravity?',
  'What data is missing for lunar habitat fire safety?',
];

function Passage({ p, n, highlighted }) {
  return <li id={`passage-${n}`} className={`cp-passage ${highlighted ? 'is-hl' : ''}`}>
    <div className="cp-passage-head">
      <span className="cp-num">S{n}</span>
      <EvidenceBadge apiKind={p.evidence_type} />
      {p.score !== null && p.score !== undefined && <span className="s-muted">relevance {p.score}</span>}
    </div>
    <strong>{p.title}</strong>
    <p>{p.text.length > 420 ? `${p.text.slice(0, 420)}…` : p.text}</p>
    <div className="cp-cite"><span>{p.citation}</span>{p.dataset_id && <a href={`#/explore?view=tables&dataset=${p.dataset_id}&row=${p.source_row}`}>Open row in Data Atlas <ArrowUpRight size={12} /></a>}{p.url && <a href={p.url} target="_blank" rel="noopener noreferrer">Open source <ArrowUpRight size={12} /></a>}</div>
  </li>;
}

function Answer({ result }) {
  const index = Object.fromEntries(result.passages.map((p, i) => [p.id, i + 1]));
  const [hl, setHl] = useState(null);
  return <div className="cp-answer">
    <div className={`cp-mode ${result.mode?.endsWith('_grounded') ? 'is-ai' : ''}`}>
      {result.mode?.endsWith('_grounded') ? <Sparkles size={15} /> : <Search size={15} />}
      <span>{result.mode_label}</span>
    </div>
    {result.notice && <div className="s-alert is-info" style={{ marginBottom: 14 }}><TriangleAlert size={16} /><span>{result.notice}</span></div>}

    {result.answer && <section className="cp-ai" aria-label="AI-assisted answer">
      <EvidenceBadge kind="ai" />
      <div className="cp-ai-text">{result.answer.map((block, i) => <span key={i}>
        {block.text}
        {[...new Set(block.citations.map(c => index[c.passage_id]).filter(Boolean))].map(n =>
          <a key={n} href={`#passage-${n}`} className="cp-ref" onMouseEnter={() => setHl(n)} onMouseLeave={() => setHl(null)}
            onClick={(e) => { e.preventDefault(); document.getElementById(`passage-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setHl(n); }}>S{n}</a>)}
      </span>)}</div>
      <p className="s-muted" style={{ marginTop: 10 }}>Generated text can be wrong. Every claim should be checked against the cited passages below.</p>
    </section>}

    {result.intent?.comparison && <section className="cp-card">
      <div className="s-row" style={{ justifyContent: 'space-between' }}><span className="s-label">Recorded-conditions comparison</span><EvidenceBadge kind="metadata">Deterministic comparison</EvidenceBadge></div>
      <h3 className="s-h3" style={{ marginTop: 8 }}>{result.intent.comparison.evidence_passport.record_ids.join(' vs ')}</h3>
      <p className="s-muted">{result.intent.comparison.summary}</p>
      <ul className="cp-fields">{result.intent.comparison.fields.filter(f => f.status !== 'match').map(f => <li key={f.key}><strong>{f.label}</strong><span>{f.first_value ?? 'Not reported'} → {f.second_value ?? 'Not reported'}</span><em className={`th-status th-${f.status}`}>{f.status}</em></li>)}</ul>
      <a className="s-btn s-btn-ghost s-btn-sm" href="#/theater">Open in Comparison Theater <ArrowUpRight size={13} /></a>
    </section>}

    {result.intent?.material && <section className="cp-card">
      <div className="s-row" style={{ justifyContent: 'space-between' }}><span className="s-label">Matching experiment records</span><EvidenceBadge kind="measured">Counted from NASA table</EvidenceBadge></div>
      <h3 className="s-h3" style={{ marginTop: 8 }}>{result.intent.material.count} BASS-II rows name {result.intent.material.group.split(' (')[0]}</h3>
      {result.intent.material.initial_o2_range && <p className="s-muted">Reported initial O₂: {result.intent.material.initial_o2_range[0]}–{result.intent.material.initial_o2_range[1]} % by volume.</p>}
      <div className="cp-ids">{result.intent.material.record_ids.slice(0, 40).map(id => <span key={id} className="s-chip">{id}</span>)}{result.intent.material.record_ids.length > 40 && <span className="s-chip">+{result.intent.material.record_ids.length - 40}</span>}</div>
      <p className="s-muted" style={{ marginTop: 8 }}>{result.intent.material.note}</p>
      <a className="s-btn s-btn-ghost s-btn-sm" href="#/explore">Inspect in Data Atlas <ArrowUpRight size={13} /></a>
    </section>}

    <section aria-label="Retrieved evidence">
      <div className="cp-section-title"><BookOpenText size={16} /> Evidence retrieved ({result.passages.length})</div>
      {result.passages.length ? <ol className="cp-passages">{result.passages.map((p, i) => <Passage key={p.id} p={p} n={i + 1} highlighted={hl === i + 1} />)}</ol>
        : <EmptyState title="No matching evidence">SOLARIS has no source passage for this question. That is missing evidence, not a negative answer.</EmptyState>}
    </section>

    <section className="cp-card cp-missing">
      <span className="s-label">Evidence vs inference</span>
      <ul>
        <li><strong>Evidence:</strong> the numbered passages, each with its source and evidence class.</li>
        <li><strong>Inference:</strong> {result.mode?.endsWith('_grounded') ? 'the AI text above, which must be checked against the passages.' : 'none generated — read the passages directly.'}</li>
        {result.integrity.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </section>
  </div>;
}

export default function Copilot() {
  const { experiments, question: savedQ, setQuestion } = useResearch();
  const health = useApi((o) => api.health(o), []);
  const [q, setQ] = useState(savedQ || '');
  const [state, setState] = useState({ result: null, loading: false, error: null });
  const [history, setHistory] = useState([]);
  const ctrl = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  async function ask(text) {
    const question = (text ?? q).trim();
    if (question.length < 2) return;
    setQ(question); setQuestion(question);
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setState({ result: null, loading: true, error: null });
    try {
      const result = await api.copilot({ question, selected_ids: experiments }, { signal: c.signal });
      setState({ result, loading: false, error: null });
      setHistory(h => [question, ...h.filter(x => x !== question)].slice(0, 6));
    } catch (error) {
      if (error.name !== 'AbortError') setState({ result: null, loading: false, error });
    }
  }

  return <div className="s-page">
    <PageHeader kicker="Research Copilot" title={<>Ask the evidence. <em>See every source.</em></>}
      lede="Questions are answered from NASA PSI records, verbatim NASA findings, listed publications, BASS-II rows and rows of the other NASA PSI tables. With a server-side AI key, an AI model (Claude or Gemini) writes a cited summary; without one, you get the ranked evidence itself — never a simulated answer."
      aside={<div className={`cp-status ${health.data?.copilot_llm ? 'is-on' : ''}`}>
        {health.loading ? <LoaderCircle size={15} className="spin" /> : health.data?.copilot_llm ? <Sparkles size={15} /> : <Database size={15} />}
        <span>{health.loading ? 'Checking…' : health.error ? 'API offline' : health.data?.copilot_llm ? 'AI synthesis available' : 'Retrieval mode (no AI key)'}</span>
      </div>} />
    <div className="container cp-layout">
      <div>
        <form className="cp-ask s-panel" onSubmit={(e) => { e.preventDefault(); ask(); }} data-reveal>
          <label htmlFor="cp-q" className="sr-only">Your research question</label>
          <MessageSquareText size={20} className="cp-ask-icon" />
          <textarea id="cp-q" ref={inputRef} className="cp-input" rows={2} maxLength={600} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Ask about an investigation, a material, a finding, or two test IDs…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <button className="s-btn s-btn-primary" type="submit" disabled={state.loading || q.trim().length < 2}>
            {state.loading ? <LoaderCircle size={16} className="spin" /> : <CornerDownLeft size={16} />} Ask
          </button>
          {experiments.length > 0 && <p className="cp-context">Context: selected experiments <strong>{experiments.join(', ')}</strong> are included.</p>}
        </form>
        <div className="cp-examples" data-reveal-group>
          {EXAMPLES.map(e => <button key={e} type="button" className="s-chip" data-reveal onClick={() => ask(e)}>{e}</button>)}
        </div>
        <div className="cp-result">
          {state.loading && <div className="s-panel" role="status"><div className="cp-thinking"><Bot size={18} /> Retrieving evidence<span className="cp-dots"><i /><i /><i /></span></div><div className="s-skel-stack" style={{ marginTop: 16 }}>{[90, 76, 84, 60].map(w => <div key={w} className="s-skeleton" style={{ height: 14, width: `${w}%` }} />)}</div></div>}
          {state.error && <ApiError error={state.error} what="a Copilot answer" onRetry={() => ask()} />}
          {state.result && <Answer result={state.result} />}
          {!state.loading && !state.result && !state.error && <EmptyState icon={Bot} title="Start with a question">Try one of the examples above. Answers stay inside the evidence held by SOLARIS.</EmptyState>}
        </div>
      </div>
      <aside className="cp-side">
        <div className="s-panel" data-reveal>
          <span className="s-label"><ShieldCheck size={13} /> How answers are built</span>
          <ol className="cp-steps">
            <li>Detect test IDs and named materials, and query the NASA table directly.</li>
            <li>Rank passages with BM25 keyword relevance — transparent and reproducible.</li>
            <li>Optionally, an AI model (Claude or Gemini) summarises <em>only</em> those passages with per-sentence citations.</li>
            <li>Evidence classes stay visible; missing evidence is reported as missing.</li>
          </ol>
        </div>
        {history.length > 0 && <div className="s-panel" data-reveal>
          <span className="s-label">Recent questions</span>
          <div className="s-stack" style={{ marginTop: 10, gap: 6 }}>{history.map(h => <button key={h} type="button" className="cp-hist" onClick={() => ask(h)}>{h}</button>)}</div>
        </div>}
        {state.result?.followups?.length > 0 && <div className="s-panel" data-reveal>
          <span className="s-label">Follow-up research</span>
          <div className="s-stack" style={{ marginTop: 10, gap: 6 }}>{state.result.followups.map(f => f.startsWith('Open ')
            ? <a key={f} className="cp-hist" href="#/theater">{f} →</a>
            : <button key={f} type="button" className="cp-hist" onClick={() => ask(f)}>{f}</button>)}</div>
        </div>}
      </aside>
    </div>
  </div>;
}
