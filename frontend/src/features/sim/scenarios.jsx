/** Demonstration scenarios (from SOLARIS 5.0): load saved inputs into a laboratory; results are computed only when the user runs them. */
import React, { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { api, loadCapabilities, store } from './api.js';
import { Btn } from './ui.jsx';

export const ROUTE = { world: '/world', flame: '/flame', flight: '/flight', coupled: '/onboard', guide: '/scenarios' };
const LOCAL = 'solaris.sim.scenarios.v1';

export const localScenarios = {
  list() { try { return JSON.parse(localStorage.getItem(LOCAL)) || []; } catch { return []; } },
  save(s) {
    const id = 'user-' + (s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'scenario') + '-' + Date.now().toString(36);
    const item = { id, origin: 'browser', schema_version: '5.0', ...s };
    try { localStorage.setItem(LOCAL, JSON.stringify([item, ...this.list()].slice(0, 50))); } catch { throw new Error('This browser could not store the scenario (storage unavailable or full).'); }
    return { id, origin: 'browser' };
  },
  get(id) { return this.list().find(s => s.id === id) || null; },
};

/** Save a scenario: on a local server it is written to the scenario store; on the hosted service it is kept in this browser. */
export async function saveScenario(body) {
  const caps = await loadCapabilities().catch(() => null);
  if (caps?.execution?.mode === 'inline') return localScenarios.save(body);
  return api.saveScenario(body);
}

/** Fetch a scenario (bundled, server-saved or browser-saved) and hand it to its destination page. */
export async function openScenario(id) {
  const s = localScenarios.get(id) ?? await api.scenario(id);
  store.set('pending_scenario', s);
  const target = '#' + (ROUTE[s.destination] ?? '/scenarios');
  if (window.location.hash.split('?')[0] === target) window.dispatchEvent(new Event('solaris5-scenario')); else window.location.hash = target;
}

/** Returns the scenario addressed to this destination (once), then keeps it for display. */
export function useScenario(destination, apply) {
  const [scn, setScn] = useState(null);
  useEffect(() => {
    const take = () => { const s = store.get('pending_scenario'); if (s && s.destination === destination) { store.set('pending_scenario', null); setScn(s); apply(s.payload, s); } };
    take(); window.addEventListener('solaris5-scenario', take); return () => window.removeEventListener('solaris5-scenario', take);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return [scn, () => setScn(null)];
}

export function ScenarioBanner({ scenario, onVariant, onClose, children }) {
  if (!scenario) return null;
  const v = scenario.payload?.variants;
  return <section className="s-panel sim-panel sim-scenario" aria-label="Loaded demonstration scenario">
    <div className="sim-panel-head"><div><span className="s-kicker"><ListChecks size={13} /> Demonstration scenario {scenario.order ?? ''}</span><h2 className="s-h3" style={{ marginTop: 10 }}>{scenario.title}</h2><p className="s-muted">{scenario.summary}</p></div>
      <div className="sim-actions"><a className="s-btn s-btn-ghost s-btn-sm" href="#/scenarios">All scenarios</a><Btn kind="ghost" small onClick={onClose}>Dismiss</Btn></div></div>
    {v && <div className="sim-actions" style={{ marginBottom: 10 }}>{v.map((x, i) => <Btn kind="ghost" small key={i} onClick={() => onVariant(x)}>Load: {x.label}</Btn>)}</div>}
    {scenario.expected_behaviour && <p className="sim-p"><b>Expected behaviour:</b> {scenario.expected_behaviour}</p>}
    {scenario.acceptance_checks?.length > 0 && <details className="sim-details"><summary>Acceptance checks ({scenario.acceptance_checks.length})</summary><ul>{scenario.acceptance_checks.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
    <p className="s-muted">Inputs are loaded; nothing has been computed yet. Press the run button below.</p>{children}
  </section>;
}
