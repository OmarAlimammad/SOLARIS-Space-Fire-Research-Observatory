import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, BarChart3, Check, ChevronLeft,
  ChevronRight, CircleHelp, Database, Download, ExternalLink, FileCheck2,
  GitCompareArrows, Grid2X2, List, LoaderCircle,
  RotateCcw, Search, ShieldAlert, X,
} from 'lucide-react';
import SectionHeading from '../components/SectionHeading.jsx';
import { getExperiments, getMetadata } from '../lib/api.js';
import {
  SOURCE_URL, COVERAGE_FIELDS, applyFilters, countBy, describe, enrich,
  isValidOxygen, oxygenBin, sortRecords, toCSV,
} from '../features/data-atlas/analysis.js';
import '../features/data-atlas/dashboard.css';

const PAGE_SIZE = 12;
const INITIAL_FILTERS = { search: '', material: 'all', year: 'all', oxygen: 'all', quality: 'all' };
const SOURCE_FIELDS = [
  ['fuel', 'Fuel sample material'], ['date', 'Test date'],
  ['sample_id', 'Sample number'], ['initial_oxygen_pct', 'Initial O₂ (% by volume)'],
  ['final_oxygen_pct', 'Final O₂ (% by volume)'],
  ['flow_restrictor', 'Flow restrictor (raw setting)'],
  ['air_display', 'Air display (raw reading)'],
  ['fan_display', 'Fan display (raw reading)'],
];
const reading = v => v === undefined || v === null || String(v).trim() === '' ? 'Not reported' : String(v);
const displayOxygen = value => isValidOxygen(value) ? `${value.toFixed(1)}%` : 'Not reported / review';

function DataBars({ rows, active, onSelect, emptyLabel = 'No recorded values' }) {
  const max = Math.max(1, ...rows.map(r=>r.count));
  if (!rows.length) return <p className="atlas-empty-chart">{emptyLabel}</p>;
  return <div className="atlas-bars">{rows.map((row)=><button
    type="button" key={String(row.key)} className={`atlas-bar-row ${active===String(row.value ?? key)?'is-active':''}`}
    aria-pressed={active===String(row.value ?? key)} onClick={()=>onSelect(String(key))}
    title={`Filter by ${row.key}: ${row.count} records`}>
    <span className="atlas-bar-label">{row.key}</span>
    <span className="atlas-bar-track"><span style={{width:`${Math.max(3,(100*row.count/max))}%`}}/></span>
    <strong>{row.count}</strong>
  </button>)}</div>;
}

function CoverageBars({ records }) {
  return <div className="atlas-quality-bars">{COVERAGE_FIELDS.map(({key,label})=>{
    const count = records.filter(r => key.endsWith('oxygen_pct')
      ? isValidOxygen(r[key])
      : key === 'date' ? r.year !== null
      : r[key]!==null && r[key]!==undefined && String(r[key]).trim()!=='').length;
    const percent = records.length ? 100*count/records.length : 0;
    return <div className="atlas-quality-row" key={key}>
      <div><span>{label}</span><strong>{count}<small> / {records.length}</small></strong></div>
      <div className="atlas-quality-track"><span style={{width:`${percent}%`}}/></div>
    </div>;
  })}</div>;
}

function FieldNote({ title, children }) {
  return <div className="atlas-field-note"><span>{title}</span><p>{children}</p></div>;
}

export default function Explore() {
  const [records,setRecords] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [filters,setFilters] = useState(INITIAL_FILTERS);
  const [chart,setChart] = useState('material');
  const [sort,setSort] = useState('source');
  const [view,setView] = useState('table');
  const [page,setPage] = useState(0);
  const [detailId,setDetailId] = useState(null);
  const [compareIds,setCompareIds] = useState([]);

  useEffect(()=>{
    const ctrl = new AbortController();
    Promise.all([
      getExperiments({ limit: 500, offset: 0, signal: ctrl.signal }),
      getMetadata({ signal: ctrl.signal }),
    ]).then(([result,meta])=>{
      if (meta.total_records !== result.total) {
        setError('The API metadata and experiment totals disagree. Check the data source before creating statistics.');
        return;
      }
      if (result.total > result.items.length) {
        setError('The source table exceeds the current 500-record dashboard limit. Showing partial statistics would be misleading.');
        return;
      }
      setRecords(enrich(result.items));
      setDetailId(result.items?.[0]?.id ?? null);
    }).catch(e=>{
      if (e.name!=='AbortError') setError('Cannot reach the NASA data API. Please start the Python FastAPI backend on port 8000.');
    }).finally(()=>{if (!ctrl.signal.aborted) setLoading(false)});
    return ()=>ctrl.abort();
  },[]);

  const options = useMemo(()=>({
    materials: countBy(records,r=>r.material_group).sort((a,b)=>b.count-a.count),
    oxygen: countBy(records,r=>oxygenBin(r.initial_oxygen_pct)).sort((a,b)=>a.key-b.key),
    years: countBy(records,r=>r.year).sort((a,b)=>a.key-b.key),
  }),[records]);
  const fullStats = useMemo(()=>describe(records),[records]);
  const matching = useMemo(()=>applyFilters(records,filters),[records,filters]);
  const ranked = useMemo(()=>sortRecords(matching,sort),[matching,sort]);
  const visible = useMemo(()=>ranked.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),[ranked,page]);
  const detail = records.find(r=>r.id===detailId) || null;
  const totalPages = Math.max(1,Math.ceil(ranked.length/PAGE_SIZE));
  const setFilter=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(0)};
  const reset=()=>{setFilters(INITIAL_FILTERS);setPage(0)};
  function toggleCompare(id) {
    setCompareIds(old=>old.includes(id) ? old.filter(v=>v!==id) : old.length>=2 ? [old[1],id] : [...old,id]);
  }
  function exportCSV() {
    const blob = new Blob([toCSV(ranked)], {type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='SOLARIS_BASSII_filtered_source_metadata.csv';
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  const selectedChart = chart==='material' ? options.materials.map(r=>({...r,key:String(r.key)}))
    : chart==='oxygen' ? options.oxygen.map(r=>({key:`${r.key}–${r.key+2}%`,value:String(r.key),count:r.count}))
    : options.years.map(r=>({key:String(r.key),value:String(r.key),count:r.count}));
  const chartFilterKey=chart==='material'?'material':chart==='oxygen'?'oxygen':'year';
  const chartActive=filters[chartFilterKey];
  function selectChartBar(row) {
    const value=row.value ?? String(row.key);
    setFilter(chartFilterKey,chartActive===value?'all':value);
  }

  return <div className="inner-page atlas-page">
    <div className="container atlas-title-row">
      <SectionHeading eyebrow="DATA ATLAS / NASA PSI-25" title={<>Read the experiment. <em>Question the evidence.</em></>}
        description="A source-grounded scientific workspace for the original BASS-II experiment records. Every chart is calculated from the returned NASA table — without simulated measurements or invented fire-risk scores."/>
      <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="atlas-source-top">NASA SOURCE <ArrowUpRight size={17}/></a>
    </div>

    {loading ? <div className="container atlas-loading" role="status"><LoaderCircle className="spin" size={26}/> Reading NASA source table...</div>
    : error ? <div className="container atlas-error" role="alert"><ShieldAlert size={24}/><div><strong>Source data unavailable</strong><p>{error}</p><code>cd backend; python -m uvicorn main:app --reload --port 8000</code></div></div>
    : <>
      <div className="container atlas-workspace">
        <section className="atlas-overview" aria-label="BASS-II overview">
          <div className="atlas-overview-intro"><span className="atlas-small-label">LIVE SOURCE / PSI-25</span><h2>Experimental evidence,<br/><em>without shortcuts.</em></h2><p>BASS-II · Original NASA table · Scope limited to this dataset</p><a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">VIEW INVESTIGATION <ArrowUpRight size={16}/></a></div>
          <div className="atlas-stat"><span>RECORDS IN SOURCE</span><strong>{fullStats.total}</strong><small>Individual experimental test rows</small></div>
          <div className="atlas-stat"><span>FUEL DESCRIPTIONS</span><strong>{fullStats.distinctDescriptions}</strong><small>Distinct source text, not chemical species</small></div>
          <div className="atlas-stat"><span>INITIAL O₂ RECORDED</span><strong>{fullStats.oxygenCount}<small> / {fullStats.total}</small></strong><small>Valid values within 0–100%</small></div>
        </section>
        <div className="atlas-provenance"><FileCheck2 size={17}/><span>NASA source: PSI-25 / BASS-II</span><span className="atlas-p-dot"/><span>Descriptive statistics only</span><span className="atlas-p-dot"/><span>No validated flame-spread data in this table</span></div>

        <section className="atlas-discovery" aria-label="Interactive source visualizations">
          <article className="atlas-panel atlas-chart-panel">
            <div className="atlas-panel-top"><div><span className="atlas-small-label">01 / DISTRIBUTION</span><h3>Inside the source table</h3></div><BarChart3 size={23}/></div>
            <div className="atlas-chart-tabs" role="group" aria-label="Distribution dimensions">
              {[['material','Material groups'],['oxygen','Initial oxygen'],['years','Test years']].map(([value,label])=><button type="button" key={value} className={chart===value?'active':''} onClick={()=>setChart(value)} aria-pressed={chart===value}>{label}</button>)}
            </div>
            <DataBars rows={selectedChart} active={chartActive} onSelect={selectChartBar}/>
            <p className="atlas-chart-legend">{chart==='material' ? 'Only explicitly named materials are categorized; unlabeled descriptions remain separate.' : chart==='oxygen' ? 'Two-percentage-point bins of reported initial O₂ (% volume); click a bin to filter records.' : 'Years parsed from reported test dates. Click a year to filter records.'}</p>
          </article>
          <article className="atlas-panel atlas-coverage-panel">
            <div className="atlas-panel-top"><div><span className="atlas-small-label">02 / METADATA COVERAGE</span><h3>What was documented?</h3></div><FileCheck2 size={23}/></div>
            <p className="atlas-panel-intro">Availability across seven selected columns in the {fullStats.total} source records. This is <strong>not a scientific quality score</strong>.</p>
            <CoverageBars records={records}/>
          </article>
        </section>

        <section className="atlas-inspector" aria-label="Data quality and interpretation">
          <div className="atlas-inspector-title"><span className="atlas-small-label">03 / SCIENTIFIC READING NOTES</span><h3>Context before conclusion.</h3></div>
          <FieldNote title="SOURCE-COVERAGE RANKING">Records can be ordered by how many of seven selected metadata fields are documented. A 7/7 record is not more scientifically trustworthy or safer.</FieldNote>
          <FieldNote title="RAW INSTRUMENT VALUES">“Air display”, “Fan display” and “Flow restrictor” are original device fields, not calibrated velocity in cm/s.</FieldNote>
          <FieldNote title="MEASUREMENTS & LIMITATIONS">Initial and final O₂ are separately reported values. Their difference is not, by itself, a flame-spread rate or causally isolated combustion measurement.</FieldNote>
        </section>

        <section className="atlas-explorer" id="atlas-experiments" aria-label="Experiment explorer">
          <div className="atlas-section-heading"><div><span className="atlas-small-label">04 / EXPERIMENT EXPLORER</span><h2>Search the records.</h2><p>Filter, inspect, export and select two experiments for source-metadata comparison.</p></div><div className="atlas-count">{ranked.length} <span>/ {records.length} records shown</span></div></div>
          <div className="atlas-toolbar">
            <label className="atlas-search"><Search size={19}/><span className="sr-only">Search test ID, fuel description or sample number</span><input value={filters.search} onChange={e=>setFilter('search',e.target.value)} placeholder="Search test ID, fuel or sample..."/></label>
            <label className="atlas-select"><span>Material</span><select value={filters.material} onChange={e=>setFilter('material',e.target.value)}><option value="all">All groups</option>{options.materials.map(({key})=><option key={key} value={key}>{key}</option>)}</select></label>
            <label className="atlas-select"><span>Year</span><select value={filters.year} onChange={e=>setFilter('year',e.target.value)}><option value="all">Any year</option>{options.years.map(({key})=><option key={key} value={String(key)}>{key}</option>)}<option value="unknown">Unknown</option></select></label>
            <label className="atlas-select"><span>Data status</span><select value={filters.quality} onChange={e=>setFilter('quality',e.target.value)}><option value="all">All records</option><option value="complete">7/7 documented</option><option value="review">Missing / review cues</option><option value="missing-oxygen">O₂ not reported</option></select></label>
            <button type="button" className="atlas-clear" onClick={reset}><RotateCcw size={16}/> Reset</button>
          </div>
          {filters.oxygen!=='all'&&<div className="atlas-filter-chip">INITIAL O₂ BIN: {filters.oxygen==='unknown'?'Unknown':`${filters.oxygen}–${Number(filters.oxygen)+2}%`} <button type="button" aria-label="Remove oxygen filter" onClick={()=>setFilter('oxygen','all')}><X size={14}/></button></div>}
          <div className="atlas-record-toolbar"><div className="atlas-view-buttons" role="group" aria-label="Record display"><button type="button" className={view==='table'?'is-on':''} aria-pressed={view==='table'} onClick={()=>setView('table')}><List size={17}/> Table</button><button type="button" className={view==='cards'?'is-on':''} aria-pressed={view==='cards'} onClick={()=>setView('cards')}><Grid2X2 size={17}/> Cards</button></div><div className="atlas-right-tools"><label className="atlas-sort"><span>Sort by</span><select value={sort} onChange={e=>{setSort(e.target.value);setPage(0)}}><option value="source">Source test ID</option><option value="coverage">Metadata coverage (7 fields)</option><option value="oxygen">Initial O₂ ascending</option><option value="date">Year descending</option></select></label><button type="button" className="atlas-export" onClick={exportCSV} disabled={!ranked.length}><Download size={16}/> Export filtered CSV</button></div></div>

          <div className="atlas-record-region">
            <div className="atlas-record-list">
              {!visible.length?<div className="atlas-no-results"><CircleHelp size={24}/><h3>No matching NASA records</h3><p>Change a filter or reset the explorer.</p><button type="button" onClick={reset}>Clear all filters</button></div>:view==='table'?<div className="atlas-table-scroll"><table className="atlas-table"><thead><tr><th scope="col">Test</th><th scope="col">Fuel sample material</th><th scope="col">Initial O₂</th><th scope="col">Test date</th><th scope="col">Coverage</th><th scope="col">Compare</th></tr></thead><tbody>{visible.map(r=><tr key={r.id} className={detailId===r.id?'is-selected':''}><td><button type="button" className="atlas-row-id" onClick={()=>setDetailId(r.id)}>{r.id} <ArrowUpRight size={13}/></button></td><td><button type="button" className="atlas-fuel" onClick={()=>setDetailId(r.id)}>{r.fuel||'Not reported'}</button><small>{r.material_group}</small></td><td>{displayOxygen(r.initial_oxygen_pct)}</td><td>{reading(r.date)}</td><td><span className="atlas-coverage-tag">{r.coverage}/7</span></td><td><button type="button" className={`atlas-compare-pick ${compareIds.includes(r.id)?'on':''}`} aria-pressed={compareIds.includes(r.id)} onClick={()=>toggleCompare(r.id)}>{compareIds.includes(r.id)?<Check size={15}/>:<GitCompareArrows size={15}/>}<span>{compareIds.includes(r.id)?'Selected':'Select'}</span></button></td></tr>)}</tbody></table></div>:<div className="atlas-cards">{visible.map(r=><article key={r.id} className={`atlas-record-card ${detailId===r.id?'is-selected':''}`}><div className="atlas-record-card-head"><span>TEST / {r.id}</span><span>{r.coverage}/7 documented</span></div><button type="button" onClick={()=>setDetailId(r.id)}><strong>{r.fuel||'Material not reported'}</strong><ArrowUpRight size={18}/></button><p>{displayOxygen(r.initial_oxygen_pct)} initial O₂ · {reading(r.date)}</p><button type="button" className="atlas-compare-pick" onClick={()=>toggleCompare(r.id)}>{compareIds.includes(r.id)?'✓ Selected for compare':'+ Select for compare'}</button></article>)}</div>}
              <div className="atlas-pagination"><span>{ranked.length?`${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,ranked.length)}`:'0'} of {ranked.length}</span><div><button type="button" disabled={page===0} onClick={()=>setPage(p=>p-1)} aria-label="Previous page"><ChevronLeft size={18}/></button><span>Page {page+1} / {totalPages}</span><button type="button" disabled={page+1>=totalPages} onClick={()=>setPage(p=>p+1)} aria-label="Next page"><ChevronRight size={18}/></button></div></div>
            </div>
            <aside className="atlas-detail" aria-label="Selected experiment source details">
              <div className="atlas-detail-heading"><span className="atlas-small-label">SOURCE INSPECTOR</span><Database size={19}/></div>
              {detail ? <><h3>Test {detail.id}</h3><p className="atlas-detail-subtitle">{detail.fuel||'Material not reported'}</p><dl>{SOURCE_FIELDS.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key.endsWith('oxygen_pct')?displayOxygen(detail[key]):reading(detail[key])}</dd></div>)}</dl><div className="atlas-detail-quality"><span>{detail.coverage}/7 selected fields documented</span>{detail.review_cues.length?<p>Review cues: {detail.review_cues.join('; ')}</p>:<p>No basic missing-value or range cues in the checked fields. This does not establish scientific validity.</p>}</div><a href={detail.source_url||SOURCE_URL} target="_blank" rel="noopener noreferrer" className="atlas-detail-source">OPEN NASA INVESTIGATION <ExternalLink size={16}/></a><small className="atlas-detail-locator">{detail.source_locator}</small></> : <p>Select a record to inspect its fields.</p>}
            </aside>
          </div>
        </section>
        <div className="atlas-footer-note"><ShieldAlert size={18}/><p>All analytics are derived from the supplied NASA PSI-25 / BASS-II table. Instrument display readings are not physical flow velocities. No flame-spread measurement or fire-risk probability is calculated. Parsed material categories describe text explicitly named in the table.</p></div>
      </div>
      <div className={`atlas-compare-dock ${compareIds.length?'is-visible':''}`} aria-live="polite"><div className="atlas-compare-dock-inner"><div><GitCompareArrows size={20}/><strong>Compare experiments</strong><span>{compareIds.length?compareIds.join(' vs '):'Select two records'}</span></div><div><button type="button" className="atlas-dock-clear" onClick={()=>setCompareIds([])}>Clear</button><a className={`atlas-dock-go ${compareIds.length===2?'':'is-disabled'}`} aria-disabled={compareIds.length!==2} tabIndex={compareIds.length===2?0:-1} href={compareIds.length===2 ? `#/research?${new URLSearchParams({first:compareIds[0],second:compareIds[1]}).toString()}`:'#/explore'} onClick={e=>{if(compareIds.length!==2)e.preventDefault()}}>OPEN COMPATIBILITY ENGINE <ArrowRight size={17}/></a></div></div></div>
    </>}
  </div>;
}
