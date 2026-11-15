import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Database, Search, LoaderCircle, AlertCircle, ChevronLeft, ChevronRight, FlaskConical, ExternalLink } from 'lucide-react';
import SectionHeading from '../components/SectionHeading.jsx';
import { getExperiments, getMetadata } from '../lib/api.js';
const LIMIT = 12;
export default function Explore(){
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(0);
  const [result,setResult]=useState(null);
  const [meta,setMeta]=useState(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  useEffect(()=>{const ctrl = new AbortController();getMetadata({signal:ctrl.signal}).then(setMeta).catch(()=>{});return ()=>ctrl.abort()},[]);
  useEffect(()=>{
    const ctrl=new AbortController();setLoading(true);setError('');
    getExperiments({search:query,offset:page*LIMIT,limit:LIMIT,signal:ctrl.signal}).then(setResult).catch(e=>{if(e.name!=='AbortError')setError('Cannot reach the Python API. Start the FastAPI backend to access NASA records.');}).finally(()=>{if(!ctrl.signal.aborted)setLoading(false)});
    return ()=>ctrl.abort();
  },[query,page]);
  return <div className="inner-page"><div className="container page-top"><SectionHeading eyebrow="EXPLORE / NASA DATA" title={<>Real records. <em>Real context.</em></>} description="Browse the original BASS-II experimental table with unaltered source fields. Inspect metadata, search fuels and open the NASA investigation page."/></div>
    <div className="container explore-shell"><div className="explore-toolbar"><form className="search-control" onSubmit={e=>{e.preventDefault();setPage(0);setQuery(search.trim())}}><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search experiment ID or fuel description" placeholder="Search experiment ID or fuel description..."/><button type="submit">Search</button></form><div className="data-status"><span className={meta?'status-dot':'status-dot offline'} />{meta ? `${meta.total_records} NASA SOURCE ROWS`:'WAITING FOR API'}</div></div>
    {error ? <div className="error-panel"><AlertCircle size={24}/><div><h3>Data connection not available</h3><p>{error}</p><code>cd backend; python -m uvicorn main:app --reload --port 8000</code><p className="small-muted">The interface is ready; no fictional experiment data are shown.</p></div></div> : loading ? <div className="loading-panel"><LoaderCircle className="spin" size={26}/> Loading original NASA records...</div> : <>
      <div className="explore-summary"><div><span>RECORDS FOUND</span><strong>{result?.total ?? 0}</strong></div><div><span>DATASET</span><strong>PSI-25 / BASS-II</strong></div><div><span>NASA REPOSITORY</span><a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-25" target="_blank" rel="noreferrer">Original source <ExternalLink size={16}/></a></div></div>
      {result?.items?.length ? <div className="record-grid">{result.items.map(record=><button className={`record-card ${selected?.id===record.id?'record-selected':''}`} key={record.id} onClick={()=>setSelected(record)}><div className="record-head"><span>TEST / {record.id}</span><ArrowUpRight size={17}/></div><h3>{record.fuel || 'Material not reported'}</h3><div className="record-chips"><span>O₂ initial: {record.initial_oxygen_pct == null?'not reported':`${record.initial_oxygen_pct}%`}</span><span>{record.date || 'Date not reported'}</span></div><div className="record-foot">VIEW SOURCE METADATA <ChevronRight size={15}/></div></button>)}</div> : <div className="empty-panel">No records match that query. Try a different fuel description or experiment ID.</div>}
      <div className="pagination"><button disabled={page===0} onClick={()=>{setPage(v=>v-1);setSelected(null)}}><ChevronLeft size={17}/> Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil((result?.total??0)/LIMIT))}</span><button disabled={(page+1)*LIMIT>=(result?.total??0)} onClick={()=>{setPage(v=>v+1);setSelected(null)}}>Next <ChevronRight size={17}/></button></div>
      {selected && <div className="record-detail" id="record-detail"><div><span className="eyebrow"><span className="eyebrow-line"/> SELECTED EXPERIMENT</span><h2>NASA test {selected.id}</h2><p>{selected.fuel}</p></div><dl><div><dt>Investigation</dt><dd>BASS-II / PSI-25</dd></div><div><dt>Initial O₂ (% volume)</dt><dd>{selected.initial_oxygen_pct ?? 'Not reported'}</dd></div><div><dt>Air display (raw)</dt><dd>{selected.air_display || 'Not reported'}</dd></div><div><dt>Fan display (raw)</dt><dd>{selected.fan_display || 'Not reported'}</dd></div><div><dt>Test date</dt><dd>{selected.date || 'Not reported'}</dd></div><div><dt>Source locator</dt><dd>NASA table · Test #{selected.id}</dd></div></dl><div className="detail-footer"><p><strong>Interpretation note:</strong> “Air display” and “Fan display” are reported instrument fields, not validated flow speed in cm/s. No flame spread rate is provided by this table.</p><a href={selected.source_url} target="_blank" rel="noreferrer" className="btn btn-outline">View NASA source <ArrowUpRight size={16}/></a></div></div>}
    </>}
    <p className="source-caption">Source: NASA PSI-25 BASS-II experimental table, supplied with this project. Row extraction is not a validation of every anomalous source entry; verify original records before scientific conclusions.</p></div></div>;
}
