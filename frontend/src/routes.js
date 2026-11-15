import { lazy } from 'react';

/**
 * Route registry. Pages are discovered with import.meta.glob, so a missing or
 * renamed page file can never break the Vite build or blank the whole app —
 * the route simply shows a "module not installed" state.
 *
 * Teammate integration points:
 *  - Library:            replace src/pages/Library.jsx (same default export).
 *  - Cosmic Flame Lab v2: drop the package into src/features/cosmic-flame-v2/ with an
 *                         index.jsx default export; /lab will load it automatically.
 */
const pageModules = import.meta.glob('./pages/*.jsx');

export const ROUTES = [
  { path: '/', file: 'Home', label: 'Home', title: 'SOLARIS — Understanding Fire Beyond Earth' },
  { path: '/discover', file: 'Discover', label: 'Discover the physics', group: 'discover', title: 'Discover' },
  { path: '/lab', file: 'CosmicFlameLab', label: 'Cosmic Flame Lab', group: 'discover', title: 'Cosmic Flame Lab' },
  { path: '/timeline', file: 'Timeline', label: 'Discovery Timeline', group: 'discover', title: 'Combustion Discovery Timeline' },
  { path: '/habitat', file: 'Habitat', label: 'Habitat Safety Explorer', group: 'discover', title: 'Space Habitat Safety Explorer' },
  { path: '/explore', file: 'Explore', label: 'Data Atlas', title: 'Data Atlas' },
  { path: '/research', file: 'Research', label: 'Research Studio', group: 'research', title: 'Research Studio' },
  { path: '/theater', file: 'Theater', label: 'Comparison Theater', group: 'research', title: 'Flame Comparison Theater' },
  { path: '/universe', file: 'Universe', label: 'Evidence Universe', group: 'research', title: 'NASA Evidence Universe' },
  { path: '/report', file: 'Report', label: 'Scientific Report', group: 'research', title: 'Scientific Report' },
  { path: '/world', file: 'World', label: 'World Builder', group: 'simulate', title: 'World Builder' },
  { path: '/flame', file: 'Flame', label: 'Flame Laboratory', group: 'simulate', title: 'Flame Laboratory' },
  { path: '/flight', file: 'Flight', label: 'Flight Laboratory', group: 'simulate', title: 'Flight Laboratory' },
  { path: '/onboard', file: 'Onboard', label: 'Onboard Experiment', group: 'simulate', title: 'Onboard Experiment' },
  { path: '/scenarios', file: 'Scenarios', label: 'Scenarios', group: 'simulate', title: 'Demonstration Scenarios' },
  { path: '/methods', file: 'Methods', label: 'Methods & Runs', group: 'simulate', title: 'Simulation Methods & Validation' },
  { path: '/copilot', file: 'Copilot', label: 'Copilot', title: 'Research Copilot' },
  { path: '/library', file: 'Library', label: 'Library', title: 'NASA Research Library' },
  { path: '/about', file: 'About', label: 'About', title: 'About SOLARIS' },
];

export const NAV_GROUPS = {
  discover: { label: 'Discover', description: 'Physics, history and habitats' },
  research: { label: 'Research', description: 'Analyse and compare evidence' },
  simulate: { label: 'Simulate', description: 'Computed models, clearly labelled' },
};

const cache = new Map();
export function pageFor(route) {
  if (cache.has(route.file)) return cache.get(route.file);
  const loader = pageModules[`./pages/${route.file}.jsx`];
  const component = loader ? lazy(loader) : null;
  cache.set(route.file, component);
  return component;
}

export function findRoute(path) {
  return ROUTES.find(r => r.path === path) || null;
}
