"""Generate docs/v5/CAPABILITY_MATRIX.md and docs/v5/VV_REPORT.md from the code and the stored benchmark reports.
Run from the project root:  python tools/build_v5_docs.py"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.sim.capabilities import capabilities  # noqa: E402

D = ROOT / 'docs' / 'v5'
c = capabilities()
out = ['# SOLARIS 5.0 capability matrix', '',
       'Generated from `backend/sim/capabilities.py` (the same data the application shows). Status values: ' + ', '.join(c['statuses']) + '.', '',
       '## Fidelity levels', '', '| Level | Name | Status | Meaning |', '|---|---|---|---|']
out += [f"| {l['level']} | {l['name']} | **{l['status']}** | {l['summary']} |" for l in c['fidelity_levels']]
out += ['', '## Capabilities', '', '| Area | Capability | Status | Limits |', '|---|---|---|---|']
out += [f"| {m['area']} | {m['capability']} | **{m['status']}** | {m['limits']} |" for m in c['matrix']]
(D / 'CAPABILITY_MATRIX.md').write_text('\n'.join(out) + '\n')

b = json.loads((D / 'benchmark_report.json').read_text())
f = json.loads((D / 'flight_benchmark_report.json').read_text())
f['benchmarks'] = {x['id']: x for x in f['benchmarks']}
perf = json.loads((D / 'flight_performance.json').read_text())
fmt = lambda v: ', '.join(fmt(x) for x in v) if isinstance(v, list) else (f'{v:.4g}' if isinstance(v, float) else str(v))
rows = lambda d: [f"| {k} | {v['title']} | {v['metric']} | {fmt(v['value'])} | {v['tolerance']} | **{v['status']}** | {v['reference']} |" for k, v in d.items()]
head = ['| ID | Benchmark | Metric | Value | Acceptance | Result | Reference |', '|---|---|---|---|---|---|---|']
v = b['versions']
out = ['# SOLARIS 5.0 verification and validation report', '',
       'This report separates **verification** (the equations are solved correctly), **validation** (comparison with independent measured or published values) and **scenario execution checks** '
       '(the workflow runs end to end; no external reference). Nothing here certifies the software for engineering or safety decisions.', '',
       f"Environment of the recorded run: Python {v['python']}, Cantera {v['cantera']}, NumPy {v['numpy']}, SciPy {v['scipy']}, {v['platform']}; Node {f.get('node', '')}.",
       f"Benchmarks generated {b['generated_utc']} (combustion) and {f.get('generated_utc', '')} (flight).", '',
       '## 1. Environment, chemistry and reacting-flow benchmarks', '', 'Reproduce with `python -m backend.sim.benchmarks` (about 3 minutes).', '', *head, *rows(b['benchmarks']), '',
       '## 2. Flight benchmarks', '', 'The same quantities are asserted by `frontend/tests/flight.test.mjs` (`npm test` in `frontend/`).', '', *head, *rows(f['benchmarks']), '',
       '## 3. What is validated, and what is not', '',
       '| Item | Evidence class | Statement |', '|---|---|---|',
       '| Hydrostatic atmosphere | Validation against a published standard | Pressures at 11, 20 and 30 km agree with the U.S. Standard Atmosphere 1976. |',
       '| Level 1 equilibrium | Validation against a textbook value | Stoichiometric CH4/air adiabatic temperature within 15 K of the reference. |',
       '| Level 2 burning velocity | Validation against a measured range | CH4/air and H2/air laminar burning velocities fall inside the cited experimental ranges. |',
       '| Level 3 flow solver | Verification | Ghia cavity profile, analytic conduction decay, discrete volume balance, closed-vessel first-law pressure, buoyancy sign/symmetry, grid self-convergence. |',
       '| Level 3 flame shape, height, extinction | **Not validated** | No matching measured field data are bundled. One-step chemistry; results are model output for the stated configuration only. |',
       '| Level 3 instantaneous heat-release rate | Grid sensitive | Changes by roughly 16 % between the two finest benchmark grids; peak temperature and cumulative heat release change by < 1 %. |',
       '| Level 3 energy budget | Reported, not enforced | The primitive-variable scheme is not discretely conservative; the residual is printed for every run and can reach tens of percent of the released heat in the first milliseconds after forced ignition. |',
       '| Saturn V legacy ascent | Regression | Bit-for-bit agreement with the supplied Flight Lab V2 baseline. It is an educational reconstruction, not historical telemetry. |',
       '| N-body propagation | Verification | Kepler, Tsiolkovsky, first-order J2 regression, Lambert/propagator consistency, ephemeris interpolation against withheld JPL nodes. |',
       '| Lunar and Earth–Mars scenarios | Scenario execution check | They run and reach their stated end conditions. They are not compared with flown or published trajectories. |',
       '| 6-DOF demonstrator | Verification | Angular momentum and rotational energy conserved in torque-free motion. Hypothetical vehicle. |',
       '| Flight → chamber coupling | Verification | Sign convention and time interpolation tested exactly. |',
       '| Generated flame fields versus NASA BASS-II / Saffire / PSI records | **Not validated** | The NASA tables are shown as source evidence next to simulations; no quantitative agreement is claimed. |', '',
       '## 4. Automated test suites', '',
       '| Suite | Command | Result on the recorded Linux run |', '|---|---|---|',
       '| Python (existing SOLARIS + SOLARIS 5 simulation/API) | `pip install -r backend/requirements-dev.txt`, then `python -m unittest discover -s tests -t .` | 51 passed |',
       '| Frontend (existing SOLARIS, flight engine, SOLARIS 5 integration) | `npm test` in `frontend/` | 50 passed |',
       '| Original Saturn V Flight Lab V2 checks | `node tests.mjs` in `reference/saturn_v_flight_lab_v2/` | 16 passed |',
       '| Production build | `npm run build` in `frontend/` | succeeded |', '',
       '## 5. Browser checks (Chromium on Linux, scripted and inspected)', '',
       '- All routes load without console or page errors: home, World Builder, Flame Laboratory, Flight Laboratory, Onboard, Scenarios, Scientific Report, MissionShield.',
       '- World Builder: Mars preset evaluated, hydrostatic profile drawn, invalid mixtures rejected with the field named.',
       '- Flame Laboratory: equilibrium run; Level 3 run with stored-frame playback and passport; scenario variants (air 2225 K versus 30 % O2 in He 2709 K); N2-only oxidizer reported as non-reacting.',
       '- Flight Laboratory: all six scenarios executed, 3-D view and 2-D fallback toggled, replay scrubbed, run saved with passport.',
       '- Onboard experiment: Saturn V staging window coupled to a sealed methane/air chamber; both streams exported under one experiment ID.',
       '- Narrow viewport (390 px): no horizontal page overflow on the new pages.', '',
       '## 6. Not verified', '',
       '- **Windows and macOS were not run.** The start scripts for those systems are provided but untested in this release.',
       '- Browsers other than Chromium were not exercised.',
       '- Behaviour after a real WebGL context loss was not forced in a browser; the 2-D view is selectable manually and is used automatically when WebGL cannot be created.',
       '- Long Level 3 runs (fine grids, seconds of physical time) beyond the benchmark set.', '',
       '## 7. Performance (recorded on an 8-vCPU Linux VM)', '',
       '| Task | Typical wall time |', '|---|---|',
       *[f"| {k}: {x['title'][:70]} | {x['wall_time_s']} s |" for k, x in b['benchmarks'].items() if x.get('wall_time_s', 0) >= 1],
       *[f"| Flight: {x['name']} ({x['samples']} samples) | {x['wall_s']} s |" for x in perf['scenarios'].values()],
       '| Level 3 jet flame, 32×16 cells, 0.05 s (recorded run) | 1.1 s |', '| Level 3 jet flame, 80×40 cells, 0.4 s (recorded run) | 60 s |', '| Coupled onboard experiment, 40×20 cells, 0.6 s (recorded run) | 11 s |', '',
       'Level 3 cost grows roughly with cells × steps; the interface warns before heavy runs and every job can be canceled. Progress shown is the simulated-time fraction reported by the solver.', '']
(D / 'VV_REPORT.md').write_text('\n'.join(out))
print('written', [p.name for p in D.glob('*.md')])
