import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import Brand from './Brand.jsx';
import { NAV_GROUPS, ROUTES } from '../routes.js';
import { useSlidingIndicator } from '../lib/motion.js';

const TOP = [
  { type: 'link', path: '/', label: 'Home' },
  { type: 'group', id: 'discover' },
  { type: 'link', path: '/explore', label: 'Data Atlas' },
  { type: 'group', id: 'research' },
  { type: 'group', id: 'simulate' },
  { type: 'link', path: '/copilot', label: 'Copilot' },
  { type: 'link', path: '/library', label: 'Library' },
  { type: 'link', path: '/about', label: 'About' },
];
const DESCRIPTIONS = {
  '/discover': 'Why gravity changes a flame',
  '/lab': '3D environments + labelled flame model',
  '/timeline': 'Dated NASA milestones with sources',
  '/habitat': 'Materials, ventilation and evidence gaps',
  '/research': 'Eight source-grounded analysis tools',
  '/theater': 'Side-by-side experiments and footage',
  '/universe': 'Knowledge graph with provenance',
  '/report': 'Export a reproducible PDF and run records',
  '/world': 'Gas mixtures, gravity and atmospheres',
  '/flame': 'Cantera chemistry, 1-D and 2-D flames',
  '/flight': 'Saturn V, orbits, Moon and Mars transfers',
  '/onboard': 'A flame in a chamber aboard a flight',
  '/scenarios': 'Twelve runnable demonstrations',
  '/methods': 'Capability matrix, benchmarks, run ledger',
};

function Dropdown({ groupId, current, open, setOpen, onNavigate }) {
  const items = ROUTES.filter(r => r.group === groupId);
  const active = items.some(r => r.path === current);
  const menuRef = useRef(null);
  const isOpen = open === groupId;
  function onKey(e) {
    if (e.key === 'Escape') { setOpen(null); e.currentTarget.querySelector('button')?.focus(); }
    if (e.key === 'ArrowDown' && isOpen) { e.preventDefault(); const links = [...menuRef.current.querySelectorAll('a')]; const i = links.indexOf(document.activeElement); links[(i + 1) % links.length]?.focus(); }
    if (e.key === 'ArrowUp' && isOpen) { e.preventDefault(); const links = [...menuRef.current.querySelectorAll('a')]; const i = links.indexOf(document.activeElement); links[(i - 1 + links.length) % links.length]?.focus(); }
  }
  return <div className={`nav-group ${isOpen ? 'is-open' : ''}`} onKeyDown={onKey}
    onMouseEnter={() => window.matchMedia('(hover: hover) and (min-width: 941px)').matches && setOpen(groupId)}
    onMouseLeave={() => window.matchMedia('(hover: hover) and (min-width: 941px)').matches && setOpen(null)}>
    <button type="button" className={`nav-trigger ${active ? 'active' : ''}`} aria-expanded={isOpen} aria-haspopup="true"
      data-active={active || undefined} onClick={() => setOpen(isOpen ? null : groupId)}>
      {NAV_GROUPS[groupId].label} <ChevronDown size={14} className="nav-chevron" />
    </button>
    <div className="nav-menu" ref={menuRef} role="menu" aria-label={NAV_GROUPS[groupId].label}>
      <span className="nav-menu-kicker">{NAV_GROUPS[groupId].description}</span>
      {items.map(r => <a key={r.path} role="menuitem" href={`#${r.path}`} className={current === r.path ? 'is-current' : ''}
        aria-current={current === r.path ? 'page' : undefined} onClick={onNavigate} tabIndex={isOpen ? 0 : -1}>
        <strong>{r.label}</strong><small>{DESCRIPTIONS[r.path]}</small>
      </a>)}
    </div>
  </div>;
}

export default function SiteHeader({ current }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [open, setOpen] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef(null);
  const headerRef = useRef(null);
  const [navTop, setNavTop] = useState(undefined);
  const indicator = useSlidingIndicator(navRef, '.main-nav > a.active, .main-nav > .nav-group > .nav-trigger.active', [current, mobileOpen]);

  useEffect(() => { setOpen(null); setMobileOpen(false); }, [current]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!navRef.current?.contains(e.target)) setOpen(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => {
    if (mobileOpen) setNavTop(Math.max(0, headerRef.current?.getBoundingClientRect().bottom ?? 0));
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const done = () => { setOpen(null); setMobileOpen(false); };
  return <>
    <div className="research-bar"><span className="research-bar-dot" /> OPEN RESEARCH INITIATIVE <span className="research-bar-sep">/</span> MICROGRAVITY COMBUSTION <span className="research-bar-hide">/ BUILT ON NASA PSI SOURCE DATA</span></div>
    <header ref={headerRef} className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="header-inner container">
        <Brand />
        <nav ref={navRef} className={`main-nav ${mobileOpen ? 'is-open' : ''}`} aria-label="Main navigation" style={mobileOpen && navTop !== undefined ? { top: navTop } : undefined}>
          <span className="nav-indicator" style={indicator} aria-hidden="true" />
          {TOP.map(item => item.type === 'link'
            ? <a key={item.path} href={`#${item.path}`} className={current === item.path ? 'active' : ''} aria-current={current === item.path ? 'page' : undefined} onClick={done}>{item.label}</a>
            : <Dropdown key={item.id} groupId={item.id} current={current} open={open} setOpen={setOpen} onNavigate={done} />)}
        </nav>
        <a href="#/research" className="header-action">Open Studio <ArrowUpRight size={16} /></a>
        <button type="button" className="menu-toggle" onClick={() => setMobileOpen(v => !v)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen}>{mobileOpen ? <X size={24} /> : <Menu size={24} />}</button>
      </div>
    </header>
  </>;
}
