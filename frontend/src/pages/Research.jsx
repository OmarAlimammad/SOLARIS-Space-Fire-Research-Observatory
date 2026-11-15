import React from 'react';
import { ArrowUpRight, ClipboardList } from 'lucide-react';
import { researchModules } from '../data/researchModules.js';
import { PageHeader } from '../components/ui.jsx';
import { replaceParams } from '../lib/router.js';
import CompatibilityWorkspace from '../features/compatibility/CompatibilityWorkspace.jsx';
import { AdvisorTool, ContradictionTool, FlameTracker, GapTool, TransferTool, WhatIfTool } from '../features/studio/StudioTools.jsx';
import { RefereeTool } from '../features/studio/SourceTableTools.jsx';

const TOOLS = {
  compatibility: CompatibilityWorkspace,
  contradictions: ContradictionTool,
  gaps: GapTool,
  safety: TransferTool,
  flame: FlameTracker,
  whatif: WhatIfTool,
  advisor: AdvisorTool,
  referee: RefereeTool,
};

export default function Research({ params }) {
  const requested = params?.get('tool');
  const [active, setActiveState] = React.useState(TOOLS[requested] ? requested : 'compatibility');
  const setActive = (id) => {
    setActiveState(id);
    const keep = Object.fromEntries(params ? [...params.entries()] : []);
    replaceParams({ ...keep, tool: id });
  };
  // Follow in-app links that change only the query (e.g. #/research?tool=gaps while already on the Studio).
  React.useEffect(() => { if (requested && TOOLS[requested]) setActiveState(requested); }, [requested]);
  const Tool = TOOLS[active];

  return (
    <div className="inner-page">
      <PageHeader kicker="Research Studio / Eight tools"
        title={<>From NASA records to <em>traceable conclusions.</em></>}
        lede="Eight working analysis tools. Each one states what it computes, which evidence class it uses, and what it cannot tell you. None of them produces risk scores or invented measurements." />

      <div className="container research-layout">
        <aside className="research-sidebar" aria-label="Research modules">
          <div className="research-sidebar-top">RESEARCH MODULES <span>{String(researchModules.length).padStart(2, '0')}</span></div>
          {researchModules.map(module => {
            const Icon = module.icon;
            return <button key={module.id} type="button" onClick={() => setActive(module.id)}
              className={`research-navitem ${active === module.id ? 'selected' : ''}`} aria-current={active === module.id ? 'true' : undefined}>
              <span className="research-navnumber">{module.number}</span>
              <span className="st-nav-label"><span>{module.title}</span><small>{module.subtitle}</small></span>
              <Icon size={16} />
            </button>;
          })}
          <div className="st-side-links">
            <a href="#/theater">Comparison Theater <ArrowUpRight size={13} /></a>
            <a href="#/universe">Evidence Universe <ArrowUpRight size={13} /></a>
            <a href="#/report">Scientific Report <ArrowUpRight size={13} /></a>
          </div>
        </aside>
        <div className="st-stage s-tabpanel" key={active}><Tool /></div>
      </div>
      <div className="container research-outro">
        <ClipboardList size={22} />
        <p>Measured source fields, raw instrument settings, parsed metadata and unverified assumptions must remain distinguishable.</p>
        <a href="#/explore" className="text-link">Inspect NASA source records <ArrowUpRight size={17} /></a>
      </div>
    </div>
  );
}
