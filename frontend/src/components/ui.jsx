import React, { useId, useRef } from 'react';
import { AlertTriangle, ArrowUpRight, Inbox, RefreshCw, ServerOff } from 'lucide-react';
import { useSlidingIndicator } from '../lib/motion.js';
import { API_HINT } from '../lib/api.js';

/** Evidence classes used everywhere in SOLARIS. */
export const EVIDENCE = {
  measured: { cls: 'ev-measured', label: 'Measured data' },
  metadata: { cls: 'ev-metadata', label: 'Experimental metadata' },
  instrument: { cls: 'ev-instrument', label: 'Raw instrument field' },
  finding: { cls: 'ev-finding', label: 'Published finding' },
  model: { cls: 'ev-model', label: 'Simplified model' },
  illustration: { cls: 'ev-illustration', label: 'Educational illustration' },
  ai: { cls: 'ev-ai', label: 'AI-assisted interpretation' },
  missing: { cls: 'ev-missing', label: 'Unavailable evidence' },
  simulation: { cls: 'ev-simulation', label: 'Simulation output' },
};
export const EVIDENCE_FROM_API = {
  published_finding: 'finding', psi_record_text: 'metadata', publication: 'finding', experimental_record: 'measured',
  educational_note: 'illustration', reported_measurement: 'measured', instrument_setting: 'instrument',
  instrument_readout: 'instrument', parsed_label: 'metadata', parsed_source_text: 'metadata', reported: 'metadata',
  measured: 'measured', experimental_metadata: 'metadata', source_table_row: 'measured',
};
const API_LABEL_OVERRIDE = { psi_record_text: 'NASA PSI record text', publication: 'Listed publication', educational_note: 'SOLARIS explainer', experimental_record: 'BASS-II record', source_table_row: 'NASA source-table row' };

export function EvidenceBadge({ kind, apiKind, children }) {
  const key = kind || EVIDENCE_FROM_API[apiKind] || 'metadata';
  const meta = EVIDENCE[key] || EVIDENCE.metadata;
  return <span className={`ev-badge ${meta.cls}`}>{children || API_LABEL_OVERRIDE[apiKind] || meta.label}</span>;
}

export function PageHeader({ kicker, title, lede, aside }) {
  return <div className="container s-page-head">
    <div data-reveal>
      <span className="s-kicker">{kicker}</span>
      <h1 className="s-title">{title}</h1>
      {lede && <p className="s-lede">{lede}</p>}
    </div>
    {aside && <div data-reveal style={{ '--reveal-i': 1 }}>{aside}</div>}
  </div>;
}

export function Tabs({ tabs, value, onChange, label }) {
  const ref = useRef(null);
  const base = useId();
  const style = useSlidingIndicator(ref, '[aria-selected="true"]', [value, tabs.length]);
  function onKey(e) {
    const i = tabs.findIndex(t => t.value === value);
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      e.preventDefault();
      onChange(tabs[next].value);
      ref.current?.querySelectorAll('[role="tab"]')[next]?.focus();
    }
  }
  return <div className="s-tabs" role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
    <span className="s-tab-indicator" style={style} aria-hidden="true" />
    {tabs.map(t => <button key={t.value} type="button" role="tab" id={`${base}-${t.value}`} className="s-tab"
      aria-selected={value === t.value} tabIndex={value === t.value ? 0 : -1} onClick={() => onChange(t.value)}>
      {t.icon}{t.label}
    </button>)}
  </div>;
}

export function Skeleton({ lines = 4, height = 14, style }) {
  return <div className="s-skel-stack" role="status" aria-label="Loading" style={style}>
    {Array.from({ length: lines }, (_, i) => <div key={i} className="s-skeleton" style={{ height, width: `${100 - (i % 3) * 14}%` }} />)}
  </div>;
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return <div className="s-empty"><Icon size={26} strokeWidth={1.6} /><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}

export function ApiError({ error, onRetry, what = 'this data' }) {
  const offline = !error || /fetch|network|Failed|50[0-9]|404/i.test(String(error.message || ''));
  return <div className="s-alert is-error" role="alert">
    {offline ? <ServerOff size={19} /> : <AlertTriangle size={19} />}
    <div>
      <strong>Could not load {what}.</strong>{' '}
      {offline ? <>The SOLARIS research API does not appear to be running. Start it with <code>{API_HINT}</code>.</> : error.message}
      {onRetry && <div style={{ marginTop: 8 }}><button type="button" className="s-btn s-btn-ghost s-btn-sm" onClick={onRetry}><RefreshCw size={14} /> Try again</button></div>}
    </div>
  </div>;
}

export function SourceLink({ href, children = 'Source' }) {
  if (!href) return null;
  return <a className="s-btn s-btn-quiet s-btn-sm" href={href} target="_blank" rel="noopener noreferrer">{children} <ArrowUpRight size={14} className="nudge" /></a>;
}

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  componentDidCatch(error, info) { console.error('SOLARIS view error', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="container" style={{ padding: '72px 0' }}>
      <EmptyState icon={AlertTriangle} title="This view hit an unexpected error"
        action={<a className="s-btn s-btn-primary" href="#/">Return home</a>}>
        The rest of SOLARIS still works. Details were written to the browser console. ({String(this.state.error.message || this.state.error)})
      </EmptyState>
    </div>;
  }
}
