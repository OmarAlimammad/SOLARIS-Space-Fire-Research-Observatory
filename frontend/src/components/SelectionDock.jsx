import React from 'react';
import { FileDown, GitCompareArrows, MessageSquareText, X } from 'lucide-react';
import { useResearch } from '../state/ResearchContext.jsx';
import { href } from '../lib/router.js';

/** Floating summary of the shared experiment selection, with next steps. */
export default function SelectionDock({ current }) {
  const { experiments, clear } = useResearch();
  const hidden = ['/theater', '/report', '/explore'].includes(current);
  const visible = experiments.length > 0 && !hidden;
  return <div className={`s-selection-dock ${visible ? 'is-visible' : ''}`} aria-hidden={!visible} role="region" aria-label="Selected experiments">
    <GitCompareArrows size={18} />
    <span><strong>{experiments.join(' vs ') || '—'}</strong> selected</span>
    <a className="s-btn s-btn-primary" href={href('/theater')} tabIndex={visible ? 0 : -1}>Compare</a>
    <a className="s-btn s-btn-ghost" href={href('/copilot')} tabIndex={visible ? 0 : -1} aria-label="Ask Copilot about selection"><MessageSquareText size={14} /></a>
    <a className="s-btn s-btn-ghost" href={href('/report')} tabIndex={visible ? 0 : -1} aria-label="Build report from selection"><FileDown size={14} /></a>
    <button type="button" className="s-btn s-btn-ghost" onClick={clear} tabIndex={visible ? 0 : -1} aria-label="Clear selection"><X size={14} /></button>
  </div>;
}
