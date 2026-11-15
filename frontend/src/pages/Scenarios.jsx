/** Demonstration scenarios (from SOLARIS 5.0): twelve saved, runnable cases with expected behaviour and acceptance checks. */
import React, { useState } from 'react';
import { ArrowUpRight, ListChecks } from 'lucide-react';
import { api } from '../features/sim/api.js';
import { Card, Cards, ErrorBox, Level, Page, Panel, Tag, useAsync } from '../features/sim/ui.jsx';
import { localScenarios, openScenario } from '../features/sim/scenarios.jsx';
import { Skeleton } from '../components/ui.jsx';

const DEST = { world: 'World Builder', flame: 'Flame Laboratory', flight: 'Flight Laboratory', coupled: 'Onboard experiment', guide: 'Checklist' };
const TOUR = [
  ['/explore?view=tables', 'Open a NASA source record', 'In the Data Atlas, open a BASS-II or other PSI table row and read its recorded conditions (oxygen, pressure, flow) exactly as written. This is NASA source evidence.'],
  ['/world', 'Build a comparable environment', 'In the World Builder choose “Spacecraft cabin”, enter a composition and pressure similar to the record, and evaluate it. Select it as the active environment.'],
  ['/flame', 'Run a supported simulation', 'In the Flame Laboratory run an equilibrium or 2-D transient case in that environment. This is a simulation output.'],
  ['/flame', 'Read the Simulation Passport', 'Below the result, the passport lists the model, assumptions, numerical diagnostics, verification benchmarks and validation status.'],
  ['/report', 'Collect the report', 'The Scientific Report page lists simulation runs next to the NASA evidence report and exports each run record.'],
];

export default function Scenarios() {
  const list = useAsync(s => api.scenarios(s), []), [error, setError] = useState(null), [guide, setGuide] = useState(null);
  const open = async s => { setError(null); try { if (s.destination === 'guide') setGuide(await api.scenario(s.id)); else await openScenario(s.id); } catch (e) { setError(e); } };
  const items = [...(list.data?.scenarios ?? []), ...localScenarios.list()];
  return <Page kicker="Simulate / Demonstration scenarios" title={<>Saved, runnable <em>scenarios.</em></>}
    lede="Each scenario loads real inputs into its laboratory; results are computed only when you press run. Every scenario states the expected behaviour and measurable acceptance checks.">
    <ErrorBox error={error || list.error} onRetry={list.error ? list.retry : undefined} />
    <Panel title={<><ListChecks size={17} className="sim-ico" /> Scenarios</>} sub="Bundled demonstrations, plus any you saved from the World Builder.">
      {list.loading && <Skeleton lines={3} />}
      {!list.loading && !items.length && <p className="s-muted">No scenarios are available.</p>}
      <Cards label="Scenarios">{items.map(s => <Card key={s.id} onClick={() => open(s)}>
        <span className="sim-row">{s.fidelity_level != null ? <Level level={s.fidelity_level} /> : <span className="s-chip">Guide</span>}<Tag>{DEST[s.destination] ?? s.destination}</Tag>{s.origin !== 'bundled' && <Tag tone="warn">{s.origin === 'browser' ? 'saved in this browser' : 'saved by user'}</Tag>}</span>
        <strong>{s.order ? `${s.order}. ` : ''}{s.title}</strong><span>{s.summary}</span>{s.expected_runtime && <span className="s-muted">Typical compute time: {s.expected_runtime}</span>}</Card>)}</Cards>
    </Panel>
    {guide && <Panel title={guide.title} sub={guide.summary}><div className="s-table-wrap"><table className="s-table"><thead><tr><th>Case</th><th>What to do</th><th>Required outcome</th><th /></tr></thead>
      <tbody>{guide.payload.steps.map(st => <tr key={st.title}><td><b>{st.title}</b></td><td>{st.do}</td><td>{st.expect}</td><td><a className="s-btn s-btn-ghost s-btn-sm" href={'#' + st.route}>Open <ArrowUpRight size={13} /></a></td></tr>)}</tbody></table></div></Panel>}
    <Panel title="Guided sequence: from a NASA record to a report" sub="Opening a record does not validate a simulation against that experiment; the two are shown side by side with their own provenance.">
      <ol className="sim-tour">{TOUR.map(([r, t, d], i) => <li key={i}><a href={'#' + r}>{t}</a><span>{d}</span></li>)}</ol></Panel>
  </Page>;
}
