import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Beaker, CheckCircle2, ClipboardList, FileText, GitCompareArrows, LoaderCircle, ShieldAlert } from 'lucide-react';
import { getExperiments, compareExperiments } from '../../lib/api.js';
import './compatibility.css';

function display(value) {
  return value === null || value === undefined || String(value).trim() === ''
    ? 'Not reported'
    : String(value);
}

const STATUS_LABEL = {
  match: 'Source match',
  different: 'Source difference',
  unknown: 'Unknown',
};

function EvidencePassport({ passport }) {
  return (
    <aside className="compat-passport" aria-label="Evidence Passport">
      <div className="compat-passport-eyebrow"><FileText size={16} /> EVIDENCE PASSPORT / 001</div>
      <h3>Where does this conclusion come from?</h3>
      <dl className="compat-passport-facts">
        <div><dt>Source</dt><dd>{passport.source_dataset}</dd></div>
        <div><dt>Test IDs</dt><dd>{passport.record_ids.join(' · ')}</dd></div>
        <div><dt>Evidence type</dt><dd>{passport.evidence_type}</dd></div>
        <div><dt>Assessment</dt><dd>{passport.status}</dd></div>
      </dl>

      <a href={passport.source_url} target="_blank" rel="noopener noreferrer" className="compat-source-link">
        Open NASA investigation <ArrowUpRight size={16} />
      </a>
      <h4>Source locators</h4>
      <ul>{passport.source_locators.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <h4>Methods</h4>
      <p>{passport.methodology}</p>
      <h4>Evidence limitations</h4>
      <ul className="compat-limits">{passport.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </aside>
  );
}

export default function CompatibilityWorkspace() {
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState('');
  const [firstId, setFirstId] = useState('');
  const [secondId, setSecondId] = useState('');
  const [comparison, setComparison] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState('');
  const comparisonAbortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getExperiments({ limit: 500, signal: controller.signal })
      .then((result) => {
        const items = result.items || [];
        setRecords(items);
        // Accept validated test IDs from the Data Atlas deep link.
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const requestedFirst = params.get('first');
        const requestedSecond = params.get('second');
        const knownIds = new Set(items.map(item => item.id));
        setFirstId(knownIds.has(requestedFirst) ? requestedFirst : items[0]?.id || '');
        setSecondId(knownIds.has(requestedSecond) ? requestedSecond : items[1]?.id || '');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setRecordsError('The NASA source records could not be loaded. Verify that the FastAPI server is running.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRecords(false);
      });
    return () => {
      controller.abort();
      comparisonAbortRef.current?.abort();
    };
  }, []);

  function handleSelection(setter, id) {
    comparisonAbortRef.current?.abort();
    setIsComparing(false);
    setter(id);
    setComparison(null);
    setCompareError('');
  }

  async function handleCompare(event) {
    event.preventDefault();
    if (!firstId || !secondId || firstId === secondId) return;
    comparisonAbortRef.current?.abort();
    const controller = new AbortController();
    comparisonAbortRef.current = controller;
    setComparison(null);
    setCompareError('');
    setIsComparing(true);
    try {
      const next = await compareExperiments({ firstId, secondId, signal: controller.signal });
      if (!controller.signal.aborted) setComparison(next);
    } catch (error) {
      if (error.name !== 'AbortError') setCompareError(error.message || 'Comparison failed.');
    } finally {
      if (!controller.signal.aborted) setIsComparing(false);
    }
  }

  return (
    <div className="research-panel compat-panel">
      <div className="research-panel-head">
        <span className="eyebrow"><span className="eyebrow-line"/> WORKSPACE / 01</span>
        <span className="compat-status"><CheckCircle2 size={14} /> SOURCE-METADATA COMPARISON</span>
      </div>

      <div className="compat-heading">
        <div className="compat-heading-icon"><GitCompareArrows size={25} strokeWidth={1.6}/></div>
        <h2>Experiment Compatibility</h2>
        <p>Select two real BASS-II test records to examine matching, differing, and unknown conditions. This is a <strong>descriptive source comparison</strong>, not a claim of physical equivalence or a flame-spread prediction.</p>
      </div>

      {loadingRecords ? (
        <div className="compat-message"><LoaderCircle size={20} className="spin"/> Loading NASA experiment records...</div>
      ) : recordsError ? (
        <div className="compat-message compat-error" role="alert"><AlertCircle size={19}/>{recordsError}</div>
      ) : (
        <form onSubmit={handleCompare} className="compat-selector">
          <label htmlFor="compat-first">
            <span>EXPERIMENT A</span>
            <select id="compat-first" value={firstId} onChange={e => handleSelection(setFirstId, e.target.value)}>
              {records.map(record => <option key={record.id} value={record.id}>{record.id} — {record.fuel || 'Material not reported'}</option>)}
            </select>
          </label>
          <div className="compat-divider-icon" aria-hidden="true"><GitCompareArrows size={21}/></div>
          <label htmlFor="compat-second">
            <span>EXPERIMENT B</span>
            <select id="compat-second" value={secondId} onChange={e => handleSelection(setSecondId, e.target.value)}>
              {records.map(record => <option key={record.id} value={record.id}>{record.id} — {record.fuel || 'Material not reported'}</option>)}
            </select>
          </label>
          <div className="compat-submit-row">
            <p>Records are sourced from the NASA PSI-25 / BASS-II table. No artificial measurements are generated.</p>
            <button type="submit" className="compat-run" disabled={isComparing || !firstId || !secondId || firstId === secondId}>
              {isComparing ? 'Comparing...' : 'Compare recorded conditions'}
              {isComparing ? <LoaderCircle size={16} className="spin"/> : <Beaker size={16}/>}
            </button>
          </div>
          {firstId === secondId && <p className="compat-inline-error">Choose two different test IDs.</p>}
        </form>
      )}

      {compareError && <div className="compat-message compat-error" role="alert"><AlertCircle size={19}/>{compareError}</div>}

      {!comparison && !isComparing && !compareError && !loadingRecords && !recordsError && (
        <div className="compat-empty">
          <ClipboardList size={21} />
          <div><strong>Ready to compare source records.</strong><span>Choose two tests and select “Compare recorded conditions”. The analysis will state uncertainties explicitly.</span></div>
        </div>
      )}

      {comparison && (
        <div className="compat-result" aria-live="polite">
          <div className="compat-assessment">
            <div>
              <span>SCIENTIFIC ASSESSMENT</span>
              <h3>{comparison.assessment_label}</h3>
              <p>{comparison.summary}</p>
            </div>
            <div className="compat-tallies" aria-label="Compared field counts">
              <div><strong>{comparison.comparison.matches}</strong><span>Source matches</span></div>
              <div><strong>{comparison.comparison.differences}</strong><span>Differences</span></div>
              <div><strong>{comparison.comparison.unknown}</strong><span>Unknown</span></div>
            </div>
          </div>

          <div className="compat-fields-title"><span>CONDITIONS MATRIX</span><span>{comparison.first.id} / {comparison.second.id}</span></div>
          <div className="compat-table-scroll">
            <table className="compat-table">
              <thead>
                <tr><th scope="col">Source-based field</th><th scope="col">{comparison.first.id}</th><th scope="col">{comparison.second.id}</th><th scope="col">Review</th></tr>
              </thead>
              <tbody>
                {comparison.fields.map(field => (
                  <tr key={field.key}>
                    <th scope="row">{field.label}<small>{field.interpretation}</small></th>
                    <td>{display(field.first_value)}</td>
                    <td>{display(field.second_value)}</td>
                    <td><span className={`compat-field-status compat-${field.status}`}>{STATUS_LABEL[field.status] || field.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="compat-caveat"><ShieldAlert size={19}/><p><strong>Not a risk score.</strong> Similar raw instrument readings do not imply equal physical airflow. The original table does not supply flame-spread rate measurements or sufficient context to prove physical equivalence.</p></div>
          <EvidencePassport passport={comparison.evidence_passport}/>
        </div>
      )}
    </div>
  );
}
