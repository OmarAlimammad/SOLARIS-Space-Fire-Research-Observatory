/**
 * Data Atlas · All NASA source tables (merged from SOLARIS 3.0–5.0 MultiAtlas + MissionShield).
 * Every PSI experimental table in data/raw/ — unchanged bytes, row locators, field units as written,
 * isolated per-table filters/summaries/exports, Evidence DNA passports and literal record comparison.
 * No cross-table pooling, no unit conversion, no calibration.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Columns2, Download, FileCheck2, Fingerprint, LoaderCircle, Pin, PinOff, RotateCcw, Search, X } from 'lucide-react';
import { tableLabel, tablesApi, useApi } from '../../lib/api.js';
import { replaceParams } from '../../lib/router.js';
import { useResearch } from '../../state/ResearchContext.jsx';
import { ApiError, EmptyState, EvidenceBadge, Skeleton } from '../../components/ui.jsx';
import { queryParts, restoreView, togglePin } from './workspace.js';
import './source-tables.css';

const PAGE = 25;
const pretty = v => typeof v === 'number' ? v.toLocaleString('en-US', { maximumSignificantDigits: 7 }) : v;
const OPS = { contains: 'contains', eq: 'is exactly', missing: 'is blank / missing', gte: '≥', lte: '≤' };

export default function SourceTables({ params }) {
  const reg = useApi((o) => tablesApi.registry(o), []);
  const { setInvestigation } = useResearch();
  const requested = params?.get('dataset');
  const [id, setId] = useState(() => requested || (() => { try { return sessionStorage.getItem('solaris:atlas:dataset'); } catch { return null; } })() || 'bass-table');
  const focusRow = params?.get('row');
  useEffect(() => { if (requested) setId(requested); }, [requested]);   // follow deep links while already on this view
  const items = reg.data?.items ?? [];
  const meta = items.find(d => d.id === id) || items[0];
  const choose = d => {
    setId(d.id); setInvestigation(d.site_investigation);
    try { sessionStorage.setItem('solaris:atlas:dataset', d.id); } catch { /* optional */ }
    replaceParams({ view: 'tables', dataset: d.id });
  };
  if (reg.loading) return <div className="container"><Skeleton lines={6} /></div>;
  if (reg.error) return <div className="container"><ApiError error={reg.error} onRetry={reg.reload} what="the NASA source-table registry" /></div>;
  const matched = items.filter(d => d.psi_listing?.status === 'name_and_size_match').length;
  return <div className="container ta-wrap">
    <section className="ta-inventory" aria-label="Source-table inventory">
      <div><span className="atlas-small-label">LIVE SOURCES / NASA PSI</span><h2>Every experimental table,<br /><em>exactly as published.</em></h2>
        <p>Original bytes, original headers, original units. Each table is read on its own — rows are never pooled across investigations.</p></div>
      <dl>
        <div><dt>Investigations</dt><dd>{reg.data.investigation_count}</dd></div>
        <div><dt>Source tables</dt><dd>{reg.data.available_count}<small>/ {reg.data.dataset_count}</small></dd></div>
        <div><dt>CSV data rows</dt><dd>{reg.data.total_source_rows.toLocaleString()}</dd><small>not a count of independent tests</small></div>
        <div><dt>Match PSI file listing</dt><dd>{matched}<small>/ {items.length}</small></dd><small>name + byte size</small></div>
      </dl>
    </section>
    <div className="ta-picker" role="group" aria-label="Choose a source table">
      {items.map(d => <button key={d.id} type="button" className="s-chip" aria-pressed={meta?.id === d.id} onClick={() => choose(d)} disabled={!d.available}>
        {tableLabel(d)}<span className="ta-picker-n">{d.row_count}</span></button>)}
    </div>
    {meta && (meta.available ? <Table key={`${meta.id}:${focusRow ?? ''}`} meta={meta} focusRow={focusRow} /> : <EmptyState title="This source is unavailable">No data are substituted.</EmptyState>)}
  </div>;
}

function Table({ meta, focusRow }) {
  const [view, setView] = useState(() => restoreView(meta.id));
  const [draft, setDraft] = useState({ field: meta.columns[0], op: 'contains', value: '' });
  const [inspect, setInspect] = useState(focusRow ? Number(focusRow) : null);
  const [compare, setCompare] = useState(null);
  const field = meta.columns.includes(view.field) ? view.field : meta.columns.find(c => /fuel|material/i.test(c)) || meta.columns[0];
  const q = queryParts(view);
  const rows = useApi((o) => tablesApi.rows(meta.id, { ...q, offset: view.page * PAGE, limit: PAGE }, o), [meta.id, JSON.stringify(q), view.page]);
  const summary = useApi((o) => tablesApi.summary(meta.id, field, q, o), [meta.id, field, JSON.stringify(q)]);
  useEffect(() => { try { sessionStorage.setItem(`solaris:atlas:v1:${meta.id}`, JSON.stringify(view)); } catch { /* optional */ } }, [view, meta.id]);
  useEffect(() => { if (focusRow) document.getElementById('ta-inspector')?.scrollIntoView({ block: 'start' }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const change = values => { setView(v => ({ ...v, ...values, page: 0 })); };
  const addRule = rule => { if (view.rules.some(r => r.field === rule.field && r.op === rule.op && r.value === rule.value)) return; change({ rules: [...view.rules, rule].slice(0, 12) }); };
  const activeField = meta.fields.find(f => f.key === draft.field);
  const max = Math.max(1, ...(summary.data?.categories || []).map(c => c.count));
  const pinRows = view.pins.map(p => Number(p.split(':').at(-1)));
  const runCompare = async () => {
    setCompare({ loading: true });
    try { setCompare({ data: await tablesApi.compare({ dataset_id: meta.id, first_row: pinRows[0], second_row: pinRows[1] }) }); }
    catch (error) { setCompare({ error }); }
  };
  const listing = meta.psi_listing || {};

  return <>
    <section className="s-panel ta-prov" aria-labelledby="ta-prov-title">
      <div className="ta-prov-head">
        <div><span className="atlas-small-label">{meta.accession} · {meta.topic.toUpperCase()}</span><h2 id="ta-prov-title">{meta.name}{meta.variant !== 'table' ? ` — Flame Design (${meta.variant})` : ''}</h2></div>
        <div className="s-row"><EvidenceBadge kind="measured">NASA source table</EvidenceBadge>{listing.status === 'name_and_size_match' ? <span className="s-chip ta-ok"><FileCheck2 size={13} /> Matches PSI file listing</span> : <span className="s-chip">Not matched to PSI listing</span>}</div>
      </div>
      <p className="s-muted">{meta.provenance_status}</p>
      <dl className="ta-facts">
        <div><dt>Original file</dt><dd><code>data/raw/{meta.file}</code></dd></div>
        <div><dt>PSI-listed name</dt><dd>{listing.listed_name ?? '—'}</dd></div>
        <div><dt>SHA-256</dt><dd><code>{meta.sha256}</code></dd></div>
        <div><dt>Encoding · size</dt><dd>{meta.encoding} · {meta.bytes.toLocaleString()} B</dd></div>
        <div><dt>Rows · fields</dt><dd>{meta.row_count} source rows · {meta.columns.length} fields</dd></div>
        <div><dt>Row semantics</dt><dd>{meta.row_semantics}</dd></div>
      </dl>
      <div className="s-row">
        <a className="s-btn s-btn-ghost s-btn-sm" href={meta.source_url} target="_blank" rel="noopener noreferrer">NASA PSI record {meta.accession} <ArrowUpRight size={13} /></a>
        <a className="s-btn s-btn-ghost s-btn-sm" href={tablesApi.originalUrl(meta.id)} download><Download size={13} /> Original CSV (unchanged bytes)</a>
        {meta.investigation === 'BASS-II' && <a className="s-btn s-btn-quiet s-btn-sm" href="#/explore">Open the BASS-II analysis workspace <ArrowUpRight size={13} /></a>}
      </div>
      <div className="s-alert" style={{ marginTop: 14 }}><span>{meta.warning}</span></div>
    </section>

    <section className="s-panel ta-filter" aria-labelledby="ta-filter-title">
      <div className="ta-section-head"><div><span className="atlas-small-label">01 / FILTER THIS TABLE</span><h3 id="ta-filter-title">Ask the source</h3></div><button type="button" className="s-btn s-btn-quiet s-btn-sm" onClick={() => change({ search: '', rules: [] })}><RotateCcw size={13} /> Reset filters</button></div>
      <label className="s-field ta-search"><span>Search all source cells</span><div className="ta-search-box"><Search size={15} /><input className="s-input" value={view.search} maxLength={200} onChange={e => change({ search: e.target.value })} placeholder="Material, test identifier, source text…" /></div></label>
      <form className="ta-rule" onSubmit={e => { e.preventDefault(); addRule(draft); }}>
        <label className="s-field"><span>Source field</span><select className="s-select" value={draft.field} onChange={e => setDraft({ field: e.target.value, op: 'contains', value: '' })}>{meta.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
        <label className="s-field"><span>Condition</span><select className="s-select" value={draft.op} onChange={e => setDraft(d => ({ ...d, op: e.target.value }))}><option value="contains">Contains text</option><option value="eq">Exact source value</option><option value="missing">Blank / missing token</option>{activeField?.numeric_summary_allowed && <><option value="gte">Scalar ≥</option><option value="lte">Scalar ≤</option></>}</select></label>
        {draft.op !== 'missing' && <label className="s-field"><span>Value{['gte', 'lte'].includes(draft.op) && activeField?.unit ? ` [${activeField.unit}]` : ''}</span><input className="s-input" required maxLength={400} inputMode={['gte', 'lte'].includes(draft.op) ? 'decimal' : 'text'} value={draft.value} onChange={e => setDraft(d => ({ ...d, value: e.target.value }))} /></label>}
        <button type="submit" className="s-btn s-btn-primary" disabled={view.rules.length >= 12}>Add filter</button>
      </form>
      {view.rules.length > 0 && <div className="ta-chips">{view.rules.map((r, i) => <button key={i} type="button" className="s-chip" onClick={() => change({ rules: view.rules.filter((_, j) => j !== i) })} aria-label={`Remove filter ${r.field} ${OPS[r.op]} ${r.value ?? ''}`}>{r.field} {OPS[r.op]} {r.value} <X size={12} /></button>)}</div>}
      <p className="s-muted">Filters combine with AND. Numeric filters use only cells that are plain numbers in the unit the source states; ranges, approximate values and text are excluded and no midpoint is invented.</p>
    </section>

    <div className="s-grid-2 ta-grid">
      <section className="s-panel" aria-labelledby="ta-dist-title">
        <span className="atlas-small-label">02 / FILTERED DISTRIBUTION</span><h3 id="ta-dist-title" className="ta-h3">What is recorded?</h3>
        <label className="s-field"><span>Field</span><select className="s-select" value={field} onChange={e => change({ field: e.target.value })}>{meta.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
        {summary.loading ? <Skeleton lines={5} style={{ marginTop: 12 }} /> : summary.error ? <ApiError error={summary.error} onRetry={summary.reload} what="the summary" /> : <>
          <p className="s-muted">{summary.data.row_count} filtered source rows. Top {summary.data.categories.length} exact cell values — click a bar to filter. Counts describe source text, not physical equivalence.</p>
          <div className="ta-bars">{summary.data.categories.map((c, i) => <button key={i} type="button" disabled={view.rules.length >= 12} onClick={() => addRule({ field, op: 'eq', value: c.value })} title={`${c.value || '(blank)'}: ${c.count} rows`}>
            <span>{c.value || <em>(blank)</em>}</span><i><b style={{ transform: `scaleX(${c.count / max})` }} /></i><strong>{c.count}</strong></button>)}</div>
          {!summary.data.categories.length && <p className="s-muted">No matching rows. Clear filters to explore this table.</p>}
          {summary.data.other_category_rows > 0 && <p className="s-muted">{summary.data.other_category_rows} rows in other categories (not plotted).</p>}
          {summary.data.numeric ? <div className="ta-numeric"><span className="s-label">Scalar cells only · {summary.data.numeric.unit || 'unit not stated in source'}</span>
            <div><span>Min <b>{pretty(summary.data.numeric.min)}</b></span><span>Median <b>{pretty(summary.data.numeric.median)}</b></span><span>Max <b>{pretty(summary.data.numeric.max)}</b></span></div>
            <small>n = {summary.data.numeric.count}; {summary.data.numeric.excluded_rows} rows excluded. Descriptive values as recorded — not calibrated or validated by SOLARIS.</small></div>
            : <p className="s-muted">No permitted scalar summary for this field.</p>}
          {summary.data.field.notes.map(n => <p className="ta-note" key={n}>{n}</p>)}
        </>}
      </section>
      <section className="s-panel" aria-labelledby="ta-cov-title">
        <span className="atlas-small-label">03 / SOURCE COVERAGE</span><h3 id="ta-cov-title" className="ta-h3">Which fields are filled?</h3>
        <p className="s-muted">Whole-file coverage, independent of filters. Missing tokens: blank, N/A, NA, NaN, null. Other text (including “none”) is kept as a descriptor.</p>
        <div className="ta-coverage">{meta.fields.map(f => { const missing = f.counts.blank + f.counts.missing_token; const filled = meta.row_count - missing; return <div key={f.key}>
          <span title={f.notes.join(' ')}>{f.label}<small>{f.unit || 'unit not stated'}{f.instrument_display ? ' · raw instrument field' : ''}</small></span>
          <div className="s-bar-track" role="img" aria-label={`${filled} of ${meta.row_count} cells filled`}><div className="s-bar-fill" style={{ transform: `scaleX(${meta.row_count ? filled / meta.row_count : 0})` }} /></div><strong>{filled}/{meta.row_count}</strong></div>; })}</div>
        <p className="s-muted">{meta.quality.structural_issues.length} row-width issues · {meta.quality.duplicate_content_rows} duplicate-content rows (kept) · {meta.quality.out_of_range_cells} out-of-range composition cells.</p>
        <div className="ta-roles">{Object.entries(meta.quality.row_roles).map(([role, count]) => <span key={role} className="s-chip">{count} {role.replaceAll('_', ' ')}</span>)}</div>
      </section>
    </div>

    <section className="s-panel ta-records" aria-labelledby="ta-rec-title">
      <div className="ta-section-head"><div><span className="atlas-small-label">04 / RECORD EXPLORER</span><h3 id="ta-rec-title">Source rows</h3></div>
        <div className="s-row"><a className="s-btn s-btn-ghost s-btn-sm" href={tablesApi.exportUrl(meta.id, q, 'csv')} download><Download size={13} /> Filtered CSV</a><a className="s-btn s-btn-ghost s-btn-sm" href={tablesApi.exportUrl(meta.id, q, 'json')} download={`${meta.id}.json`}><Download size={13} /> Evidence JSON</a></div></div>
      <p className="s-muted">Filtered CSV is a derived, spreadsheet-safe export with row locators and the source hash (formula-like text is prefixed with an apostrophe). Evidence JSON keeps every cell string. Pin two rows to compare them literally.</p>
      {rows.loading ? <Skeleton lines={6} /> : rows.error ? <ApiError error={rows.error} onRetry={rows.reload} what="source rows" /> : <>
        <p className="ta-count" aria-live="polite"><b>{rows.data.total}</b> matching rows · {view.pins.length} pinned</p>
        {rows.data.total ? <div className="s-table-wrap ta-table" tabIndex={0} role="region" aria-label="Source rows, scroll horizontally"><table className="s-table"><thead><tr><th>Row</th><th>Actions</th>{meta.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{rows.data.items.map(r => { const pinned = view.pins.includes(r.id); return <tr key={r.id} className={inspect === r.source_row ? 'is-active' : ''}><th scope="row">{r.source_row}{r.role !== 'source_record' && <small className="ta-role">{r.role.replaceAll('_', ' ')}</small>}</th>
            <td className="ta-actions"><button type="button" className="s-btn s-btn-quiet s-btn-sm" onClick={() => setInspect(r.source_row)}><Fingerprint size={13} /> Inspect</button>
              <button type="button" className="s-btn s-btn-quiet s-btn-sm" aria-pressed={pinned} onClick={() => { setCompare(null); setView(v => ({ ...v, pins: togglePin(v.pins, r.id) })); }}>{pinned ? <><PinOff size={13} /> Unpin</> : <><Pin size={13} /> Pin</>}</button></td>
            {meta.columns.map(c => <td key={c}>{r.values[c] == null || r.values[c] === '' ? <em className="ta-blank">blank</em> : r.values[c]}</td>)}</tr>; })}</tbody></table></div>
          : <EmptyState title="No rows match the active filters">Remove a filter or clear the search.</EmptyState>}
        <div className="ta-pager"><button type="button" className="s-btn s-btn-ghost s-btn-sm" disabled={!view.page} onClick={() => setView(v => ({ ...v, page: v.page - 1 }))}>Previous</button>
          <span>Page {view.page + 1} / {Math.max(1, Math.ceil(rows.data.total / PAGE))}</span>
          <button type="button" className="s-btn s-btn-ghost s-btn-sm" disabled={(view.page + 1) * PAGE >= rows.data.total} onClick={() => setView(v => ({ ...v, page: v.page + 1 }))}>Next</button></div>
      </>}
      {view.pins.length > 0 && <div className="ta-pins">
        <span className="s-label">Pinned locators</span>
        <div className="s-row">{view.pins.map(p => <span key={p} className="s-chip"><button type="button" className="ta-linklike" onClick={() => setInspect(Number(p.split(':').at(-1)))}>{p}</button><button type="button" className="ta-linklike" aria-label={`Unpin ${p}`} onClick={() => { setCompare(null); setView(v => ({ ...v, pins: togglePin(v.pins, p) })); }}><X size={12} /></button></span>)}</div>
        <button type="button" className="s-btn s-btn-dark s-btn-sm" disabled={view.pins.length !== 2} onClick={runCompare}><Columns2 size={14} /> {view.pins.length === 2 ? 'Compare the two pinned rows' : 'Pin exactly two rows to compare'}</button>
      </div>}
      {compare && <CompareView state={compare} meta={meta} onClose={() => setCompare(null)} />}
    </section>
    {inspect && <Passport meta={meta} row={inspect} onClose={() => setInspect(null)} />}
  </>;
}

function CompareView({ state, onClose }) {
  if (state.loading) return <div className="ta-compare"><LoaderCircle className="spin" size={16} /> Comparing source text…</div>;
  if (state.error) return <ApiError error={state.error} what="the comparison" />;
  const d = state.data, diff = d.fields.filter(f => f.relationship !== 'same_source_text');
  return <div className="ta-compare s-tabpanel">
    <div className="ta-section-head"><div><span className="atlas-small-label">LITERAL SOURCE COMPARISON</span><h3>{d.first} vs {d.second}</h3></div><button type="button" className="s-btn s-btn-quiet s-btn-sm" onClick={onClose}><X size={13} /> Close</button></div>
    <div className="s-alert is-info"><span>{d.explanation} {diff.length} of {d.fields.length} fields differ in source text. Classification: <b>{d.classification.replaceAll('_', ' ')}</b>.</span></div>
    <div className="s-table-wrap" style={{ marginTop: 12 }}><table className="s-table"><thead><tr><th>Field</th><th>Unit</th><th>{d.first.split(':').at(-1) && `Row ${d.first.split(':').at(-1)}`}</th><th>{`Row ${d.second.split(':').at(-1)}`}</th><th>Source text</th></tr></thead>
      <tbody>{d.fields.map(f => <tr key={f.field} className={f.relationship === 'same_source_text' ? '' : 'ta-diff'}><td>{f.field}</td><td>{f.unit || '—'}</td><td>{f.first || <em className="ta-blank">blank</em>}</td><td>{f.second || <em className="ta-blank">blank</em>}</td><td>{f.relationship === 'same_source_text' ? 'same' : 'different'}</td></tr>)}</tbody></table></div>
  </div>;
}

/** Evidence DNA passport for one source row (MissionShield). */
function Passport({ meta, row, onClose }) {
  const p = useApi((o) => tablesApi.passport(meta.id, row, o), [meta.id, row]);
  return <section className="s-panel ta-passport" id="ta-inspector" aria-labelledby="ta-pp-title">
    <div className="ta-section-head"><div><span className="atlas-small-label"><Fingerprint size={12} /> EVIDENCE DNA</span><h3 id="ta-pp-title">Source row {row} · {tableLabel(meta)}</h3></div><button type="button" className="s-btn s-btn-quiet s-btn-sm" onClick={onClose}><X size={13} /> Close inspector</button></div>
    {p.loading ? <Skeleton lines={5} /> : p.error ? <ApiError error={p.error} onRetry={p.reload} what="this source row" /> : <>
      <dl className="ta-facts">
        <div><dt>Locator</dt><dd><code>{p.data.id}</code></dd></div>
        <div><dt>Physical CSV lines</dt><dd>{p.data.physical_csv_lines.join('–')}</dd></div>
        <div><dt>Record role</dt><dd>{p.data.role.replaceAll('_', ' ')}</dd></div>
        <div><dt>File SHA-256</dt><dd><code>{p.data.sha256.slice(0, 20)}…</code></dd></div>
        <div><dt>Transformations</dt><dd>{p.data.transformations.join(' · ')}</dd></div>
        <div><dt>Evidence status</dt><dd>{p.data.evidence_status.replaceAll('_', ' ')}</dd></div>
      </dl>
      <div className="s-table-wrap"><table className="s-table"><thead><tr><th>Field</th><th>Value as written</th><th>Unit</th><th>Reading</th><th>Notes</th></tr></thead>
        <tbody>{p.data.fields.map(f => <tr key={f.field}><td>{f.field}</td><td>{f.raw_value || <em className="ta-blank">blank</em>}</td><td>{f.unit || '—'}<small className="ta-role">{f.unit_status.replaceAll('_', ' ')}</small></td>
          <td>{f.scalar != null ? <span className="s-chip">scalar {pretty(f.scalar)}</span> : <span className="ta-kind">{f.value_kind.replaceAll('_', ' ')}</span>}</td><td className="ta-notes">{f.notes.join(' ')}</td></tr>)}</tbody></table></div>
      <ul className="st-limits">{p.data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </>}
  </section>;
}

export function useRegistrySummary() {
  const r = useApi((o) => tablesApi.registry(o), []);
  return useMemo(() => r.data ? { tables: r.data.available_count, rows: r.data.total_source_rows, investigations: r.data.investigation_count } : null, [r.data]);
}
