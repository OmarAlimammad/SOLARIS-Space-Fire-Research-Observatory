import React, { useState } from 'react';
import { ArrowUpRight, LockKeyhole, CheckCircle2, ClipboardList, Layers3 } from 'lucide-react';
import { researchModules } from '../data/researchModules.js';
import SectionHeading from '../components/SectionHeading.jsx';
export default function Research(){
  const [active,setActive]=useState('compatibility');
  const selected=researchModules.find(m=>m.id===active) || researchModules[0];
  const Icon=selected.icon;
  return <div className="inner-page"><div className="container page-top"><SectionHeading eyebrow="RESEARCH / THE TOOLKIT" title={<>A laboratory built for <em>better questions.</em></>} description="Explore seven planned scientific workflows. The design and navigation are functional; model outputs and scientific conclusions will appear only after implementation and validation."/></div>
    <div className="container research-layout"><div className="research-sidebar"><div className="research-sidebar-top">RESEARCH MODULES <span>07</span></div>{researchModules.map(m=><button key={m.id} onClick={()=>setActive(m.id)} className={`research-navitem ${active===m.id?'selected':''}`}><span className="research-navnumber">{m.number}</span><span>{m.title}</span><ArrowUpRight size={15}/></button>)}</div><div className="research-panel"><div className="research-panel-head"><span className="eyebrow"><span className="eyebrow-line"/> WORKSPACE / {selected.number}</span><span className="planned-pill"><LockKeyhole size={13}/> IN DEVELOPMENT</span></div><div className="research-panel-hero"><div className="research-panel-icon"><Icon size={36} strokeWidth={1.6}/></div><h2>{selected.title}</h2><p className="research-panel-subtitle">{selected.subtitle}</p><p>{selected.description}</p></div><div className="research-checks"><span>DESIGNED TO CONSIDER</span>{selected.checks.map(c=><div key={c}><CheckCircle2 size={17}/>{c}</div>)}</div><div className="research-placeholder"><Layers3 size={24}/><div><strong>Module integration space</strong><span>Validated algorithms and real outputs will be connected here. This preview does not generate predictions.</span></div></div></div></div>
    <div className="container research-outro"><ClipboardList size={22}/><p>Science-first design means openly distinguishing available datasets, implemented methods, proposed features and unverified conclusions.</p><a href="#/explore" className="text-link">Inspect the current NASA data <ArrowUpRight size={17}/></a></div>
  </div>;
}
