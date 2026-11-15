import React, { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import Brand from './Brand.jsx';

const routes = [
  { label: 'Home', path: '/' },
  { label: 'Discover', path: '/discover' },
  { label: 'Data Atlas', path: '/explore' },
  { label: 'Research Studio', path: '/research' },
  { label: 'About', path: '/about' },
];

export default function SiteHeader({ current }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="research-bar"><span className="research-bar-dot"/> OPEN RESEARCH INITIATIVE <span className="research-bar-sep">/</span> MICROGRAVITY COMBUSTION <span className="research-bar-hide">/ BASED ON NASA PSI-25 SOURCE DATA</span></div>
      <header className="site-header">
        <div className="header-inner container">
          <Brand />
          <nav className={`main-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">
            {routes.map(route => (
              <a key={route.path} href={`#${route.path}`} className={current === route.path ? 'active' : ''} aria-current={current === route.path ? 'page' : undefined} onClick={() => setOpen(false)}>{route.label}</a>
            ))}
          </nav>
          <a href="#/research" className="header-action">Open Studio <ArrowUpRight size={16}/></a>
          <button type="button" className="menu-toggle" onClick={() => setOpen(v => !v)} aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open}>{open ? <X size={24}/> : <Menu size={24}/>}</button>
        </div>
      </header>
    </>
  );
}
