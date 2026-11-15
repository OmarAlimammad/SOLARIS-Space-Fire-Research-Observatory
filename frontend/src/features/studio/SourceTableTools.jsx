/**
 * Research Studio tools over every NASA PSI source table (merged from SOLARIS 4.0 MissionShield):
 *  - TableCoverage: scalar-coverage of each numeric field in one table, with next-experiment questions.
 *  - RefereeTool:   deterministic check of one descriptive numeric claim against a table's eligible scalars.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Gavel, Lightbulb, LoaderCircle } from 'lucide-react';
import { tableLabel, tablesApi, useApi } from '../../lib/api.js';
import { ApiError, EmptyState, EvidenceBadge, Skeleton } from '../../components/ui.jsx';

export const atlasHref = (datasetId, row) => `#/explore?view=tables&dataset=${encodeURIComponent(datasetId)}${row ? `&row=${row}` : ''}`;

export function TablePicker({ registry, value, onChange, label = 'NASA source table', filter }) {
  const items = (registry?.items ?? []).filter(d => d.available && (!filter || filter(d)));
  return <label className="s-field"><span>{label}</span>
    <select className="s-select" value={value} onChange={e => onChange(e.target.value)}>
      {items.map(d => <option key={d.id} value={d.id}>{tableLabel(d)} — {d.accession} · {d.row_count} source rows</option>)}
    </select></label>;
}

/** Scalar coverage of one source table. mode="questions" shows only the derived research questions. */
export function TableCoverage({ mode = 'full', initial = 'flex-table' }) {
  const reg = useApi((o) => tablesApi.registry(o), []);
  const [id, setId] = useState(initial);
  const cov = useApi((o) => tablesApi.coverage(id, o), [id]);
  if (reg.error) return <ApiError error={reg.error} onRetry={reg.reload} what="the source-table registry" />;
  return <div className="st-tablecov">
    <div className="s-row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div style={{ flex: '1 1 320px' }}>{reg.data ? <TablePicker registry={reg.data} value={id} onChange={setId} /> : <Skeleton lines={1} />}</div>
      <a className="s-btn s-btn-ghost s-btn-sm" href={atlasHref(id)}>Open table in Data Atlas <ArrowUpRight size={13} /></a>
    </div>
    {cov.loading ? <Skeleton lines={4} style={{ marginTop: 14 }} /> : cov.error ? <ApiError error={cov.error} onRetry={cov.reload} what="coverage" /> : <>
      {mode === 'full' && <>
        <p className="s-muted" style={{ marginTop: 12 }}>{cov.data.source_record_rows} source-record rows of {cov.data.row_count} (notes, pre-test references and parameter listings excluded). Only fields with a permitted numeric interpretation are listed; identifiers and raw instrument displays are never counted as measurements.</p>
        {cov.data.fields.length ? <div className="st-covlist">{cov.data.fields.map(f => <div key={f.field} className="st-covrow">
          <span className="st-covname">{f.field}<small>{f.unit || 'unit not stated in source'}</small></span>
          <div className="s-bar-track" role="img" aria-label={`${f.scalar_rows} of ${f.source_record_rows} rows have a usable scalar`}><div className="s-bar-fill" style={{ transform: `scaleX(${f.source_record_rows ? f.scalar_rows / f.source_record_rows : 0})` }} /></div>
          <strong>{f.scalar_rows}/{f.source_record_rows}</strong></div>)}</div>
          : <EmptyState title="No numeric fields in this table">The table's fields are identifiers, descriptors or instrument displays only.</EmptyState>}
      </>}
      <div className="st-covq">
        <span className="s-label"><Lightbulb size={12} /> Questions raised by missing scalars</span>
        {cov.data.next_experiment_candidates.length ? <ul>{cov.data.next_experiment_candidates.map(c => <li key={c.field}><strong>{c.field}</strong> — {c.reason}<small> Status: {c.proposal_status.replaceAll('_', ' ')}.</small></li>)}</ul>
          : <p className="s-muted">Every listed numeric field has a usable scalar in every source-record row.</p>}
      </div>
      <ul className="st-limits">{cov.data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </>}
  </div>;
}

const STAT = [['max', 'maximum'], ['min', 'minimum'], ['median', 'median']];
/* ------------------------------------------------------------ 08 Scientific Referee */
export function RefereeTool() {
  const reg = useApi((o) => tablesApi.registry(o), []);
  const [id, setId] = useState('bass-ii-table');
  const meta = useApi((o) => tablesApi.dataset(id, o), [id]);
  const fields = useMemo(() => (meta.data?.fields ?? []).filter(f => f.numeric_summary_allowed), [meta.data]);
  const [field, setField] = useState(''), [statistic, setStatistic] = useState('max'), [relation, setRelation] = useState('gte'), [value, setValue] = useState('');
  const [res, setRes] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  useEffect(() => { setField(fields[0]?.key ?? ''); setRes(null); }, [fields]);
  const unit = fields.find(f => f.key === field)?.unit;
  const run = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null); setRes(null);
    try { setRes(await tablesApi.referee({ dataset_id: id, field, statistic, relation, proposed_value: Number(value) })); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  const supported = res?.status === 'supported_by_eligible_source_scalars';
  return <div className="research-panel st-panel">
    <div className="st-head">
      <div className="s-row" style={{ justifyContent: 'space-between' }}><span className="eyebrow"><span className="eyebrow-line" /> WORKSPACE / 08</span><EvidenceBadge kind="measured">Checked against NASA table cells</EvidenceBadge></div>
      <h2>Scientific Referee</h2>
      <p>State one descriptive numeric claim — “the maximum recorded value of this field is at least X” — and SOLARIS checks it deterministically against every eligible scalar in that NASA table. It does not fact-check open text, and a supported claim says nothing about causes or safety.</p>
    </div>
    {reg.error ? <ApiError error={reg.error} onRetry={reg.reload} what="the source-table registry" /> : <form className="st-referee" onSubmit={run}>
      {reg.data ? <TablePicker registry={reg.data} value={id} onChange={v => { setId(v); setRes(null); }} /> : <Skeleton lines={1} />}
      {meta.loading ? <Skeleton lines={2} /> : meta.error ? <ApiError error={meta.error} onRetry={meta.reload} /> : fields.length === 0
        ? <EmptyState title="No field in this table has an approved numeric interpretation">Choose another table. Identifiers, ranges, ambiguous units and raw instrument displays are excluded on purpose.</EmptyState>
        : <>
          <label className="s-field"><span>Field (unit as written in the source)</span><select className="s-select" value={field} onChange={e => { setField(e.target.value); setRes(null); }}>{fields.map(f => <option key={f.key} value={f.key}>{f.label}{f.unit ? ` [${f.unit}]` : ' [unit not stated]'}</option>)}</select></label>
          <div className="s-grid-3">
            <label className="s-field"><span>Statistic</span><select className="s-select" value={statistic} onChange={e => { setStatistic(e.target.value); setRes(null); }}>{STAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="s-field"><span>Relation</span><select className="s-select" value={relation} onChange={e => { setRelation(e.target.value); setRes(null); }}><option value="gte">is at least (≥)</option><option value="lte">is at most (≤)</option></select></label>
            <label className="s-field"><span>Claimed value {unit ? `[${unit}]` : ''}</span><input className="s-input" type="number" step="any" required inputMode="decimal" value={value} onChange={e => { setValue(e.target.value); setRes(null); }} /></label>
          </div>
          <p className="s-muted">Claim: <em>the {STAT.find(s => s[0] === statistic)[1]} recorded “{field}” in {meta.data && tableLabel(meta.data)} is {relation === 'gte' ? 'at least' : 'at most'} {value || '…'}{unit ? ` ${unit}` : ''}.</em></p>
          <div><button type="submit" className="s-btn s-btn-primary" disabled={busy || value.trim() === ''}>{busy ? <LoaderCircle size={15} className="spin" /> : <Gavel size={15} />} Check the claim</button></div>
        </>}
    </form>}
    {err && <ApiError error={err} what="the referee result" />}
    {res && <div className="s-tabpanel" style={{ marginTop: 16 }}>
      {res.status === 'insufficient_evidence' ? <div className="s-alert"><Gavel size={17} /><div><strong>Insufficient evidence.</strong> {res.reason}</div></div> : <>
        <div className={`st-verdict ${supported ? '' : 'st-source_stated_discrepancy'}`}><Gavel size={18} /><div><strong>{supported ? 'Supported by the eligible source scalars' : 'Not supported by the eligible source scalars'}</strong>
          <small>Observed {res.statistic} = {res.observed_value}{res.unit ? ` ${res.unit}` : ''} · claimed {res.relation === 'gte' ? '≥' : '≤'} {res.claimed_value} · {res.included_scalar_rows} rows included, {res.excluded_source_record_rows} excluded (blank, text, range or out of range)</small></div></div>
        <p className="s-muted" style={{ marginTop: 10 }}>Example locators: {res.example_locators.map(l => { const [ds, , n] = l.split(':'); return <a key={l} className="s-chip" style={{ marginRight: 6 }} href={atlasHref(ds, n)}>{l}</a>; })}</p>
        <p className="s-muted">Method: {res.method}. Source file SHA-256 <code>{res.source_sha256.slice(0, 16)}…</code></p>
      </>}
      <ul className="st-limits">{(res.limitations ?? []).map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>}
  </div>;
}
