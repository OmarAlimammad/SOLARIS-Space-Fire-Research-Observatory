import React, { useState } from 'react';
import { ArrowUpRight, LockKeyhole, CheckCircle2, ClipboardList, Layers3 } from 'lucide-react';
import { researchModules } from '../data/researchModules.js';
import SectionHeading from '../components/SectionHeading.jsx';
import CompatibilityWorkspace from '../features/compatibility/CompatibilityWorkspace.jsx';

export default function Research() {
  const [active, setActive] = useState('compatibility');
  const selected = researchModules.find(m => m.id === active) || researchModules[0];
  const Icon = selected.icon;

  return (
    <div className="inner-page">
      <div className="container page-top">
        <SectionHeading
          eyebrow="RESEARCH / THE TOOLKIT"
          title={<>From NASA records to <em>traceable comparisons.</em></>}
          description="Compare original BASS-II test metadata and inspect its sources and limitations. Other research modules remain clearly marked as planned until they are implemented and validated."
        />
      </div>

      <div className="container research-layout">
        <aside className="research-sidebar" aria-label="Research modules">
          <div className="research-sidebar-top">RESEARCH MODULES <span>07</span></div>
          {researchModules.map(module => (
            <button
              key={module.id}
              type="button"
              onClick={() => setActive(module.id)}
              className={`research-navitem ${active === module.id ? 'selected' : ''}`}
              aria-current={active === module.id ? 'page' : undefined}
            >
              <span className="research-navnumber">{module.number}</span>
              <span>{module.title}</span>
              <ArrowUpRight size={15} />
            </button>
          ))}
        </aside>

        {active === 'compatibility' ? (
          <CompatibilityWorkspace />
        ) : (
          <div className="research-panel">
            <div className="research-panel-head">
              <span className="eyebrow"><span className="eyebrow-line"/> WORKSPACE / {selected.number}</span>
              <span className="planned-pill"><LockKeyhole size={13}/> IN DEVELOPMENT</span>
            </div>
            <div className="research-panel-hero">
              <div className="research-panel-icon"><Icon size={36} strokeWidth={1.6}/></div>
              <h2>{selected.title}</h2>
              <p className="research-panel-subtitle">{selected.subtitle}</p>
              <p>{selected.description}</p>
            </div>
            <div className="research-checks">
              <span>DESIGNED TO CONSIDER</span>
              {selected.checks.map(item => <div key={item}><CheckCircle2 size={17}/>{item}</div>)}
            </div>
            <div className="research-placeholder">
              <Layers3 size={24}/>
              <div>
                <strong>Module integration space</strong>
                <span>Validated algorithms and real outputs will be connected here. This preview does not generate predictions.</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="container research-outro">
        <ClipboardList size={22} />
        <p>Measured source fields, raw instrument settings, parsed metadata and unverified assumptions must remain distinguishable.</p>
        <a href="#/explore" className="text-link">Inspect NASA source records <ArrowUpRight size={17}/></a>
      </div>
    </div>
  );
}

// SOLARIS_COMPAT_PATCH_APPLIED
