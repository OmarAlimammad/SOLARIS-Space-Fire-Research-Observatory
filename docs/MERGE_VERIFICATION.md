# SOLARIS 5.0 merge — verification summary

Date: 2026-11-15 · Branch `feature/v5-science-merge` (from `main` @ `27ff2de`, the commit the live deployment was built from).
Environment: Linux, Node 26, Chromium headless shell 131 (Playwright 1.49, WebGL via SwiftShader), Python 3.12.16 with the pinned engine (numpy 2.2.6, scipy 1.15.3, cantera 3.2.0), and the repository's existing Python 3.14 `.venv` without the engine.

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Backend, with simulation engine (Python 3.12) | `python -m pytest -q tests` | **78 passed** (22 live + 48 SOLARIS 4.0/5.0 + 8 merge tests), 12 subtests |
| Backend, without engine (Python 3.14 `.venv`) | same | **43 passed, 4 skipped** (engine-only tests skip; `/api/v5` answers 503 with guidance) |
| Frontend | `npm test` (`node --test tests/`) | **50 passed** — live Data Atlas + flame physics, SOLARIS 5.0 flight benchmarks (Kepler, rocket equation, J2, Lambert, ephemeris, 6-DOF, Saturn V baseline bit-for-bit vs `reference/`), Cosmic Lab physics, source-table view state, merge integration (routes, nav, labels, no CDN/iframe, 12 scenarios) |
| Production build | `npm run build` | **succeeds**; pages code-split; three.js only in the lazy 3-D chunk |
| Combustion/environment benchmarks | `python -m backend.sim.benchmarks` (scratch copy) | see "Benchmark re-run" below |

## Browser end-to-end (production build via `vite preview`)

* **Route sweep** — 21 URLs × 3 viewports (1440, 1024, 390 px): 0 console errors, 0 page errors, 0 error boundaries, 0 horizontal overflow.
* **Workflows, local job mode** — 30 checks, all passing across the full run and the targeted re-run (one run-order case was re-run in a fresh session; see notes): Data Atlas table search / bar-filter / Evidence DNA / pin + literal compare / original download / deep link / BASS-II workspace unchanged; Referee verdict flips with the claim; Gap coverage; Compatibility regression; Habitat table evidence + tracer responds to ventilation; World Builder density changes with world and hands off to the Flame Lab; Flame Lab equilibrium (2225 K vs 2226 ± 15 K reference), Level-3 frames render and the frame slider changes the time step, Markdown export; Flight Lab Saturn V run, 3-D view, replay slider changes telemetry, save → passport; Onboard coupled run → experiment ID; 12 scenarios listed and loadable; Methods matrix + benchmarks; Report run ledger + PDF download regression; Cosmic Lab default view unchanged, teammate lab Mars ambient vs sealed changes outcome; Copilot returns NASA source-table rows with Data Atlas deep links; Library links tables.
* **Workflows, hosted inline mode** (`SOLARIS_EXECUTION=inline`, same code path as `api/sim.py`) — 11/11: Methods states hosted execution; equilibrium returned in-request and kept in the browser; indeterminate progress with elapsed time; Level-3 frames returned and playable; ZIP export built from the browser record; run survives reload; flight registered with passport; onboard coupled run; scenario saved in the browser and listed; Report ledger lists browser-kept runs.
* **Regression / navigation** — 11/11 relevant checks: Theater with carried selection, Universe, Timeline, Discover, Simulate dropdown (6 items) navigates, browser back, Home grid (12 cards), mobile menu → Simulate → World Builder, reduced motion leaves nothing invisible, mobile source-table view without overflow. (A 12th check expected the selection dock on `#/explore`; the live dock is intentionally hidden there — test expectation corrected, component unchanged.)
* **Error/empty states seen** — engine missing → 503 `simulation_unavailable` with recovery text; Onboard without a saved flight → "A computed flight is required" empty state; out-of-range input (Mars 699 Pa in the 2-D solver) → field-level range message and server rejection before any computation; hosted budget exceeded → `timed_out`, no frames returned (pytest).

## Vercel preview deployment

Preview `solaris-kug6uklp7-m-54e8.vercel.app` (commit `ee923f9`, `vercel deploy`, not promoted): build **Ready**; functions `api/index` and `api/sim` 42.8 MB each (compressed), region iad1, Python 3.12.16, Cantera 3.2.0 / NumPy 2.2.6 / SciPy 1.15.3 import cleanly. Checked through `vercel curl` (preview is behind Vercel Authentication):

| Check | Result |
|---|---|
| `/`, `/ephemeris/de441_2026_2032.json` (2.5 MB), `/models/SaturnV.glb` | 200 |
| `/api/health`, `/api/v1/datasets` | OK; 12 tables, 1,467 rows, all `name_and_size_match` |
| `/api/v5/health`, `/api/v5/capabilities` | execution mode `inline` |
| Equilibrium CH₄/air | completed, 0.1 s compute, 2225 K |
| 1-D premixed CH₄/air | completed, 39 s compute, S_L = 0.382 m/s |
| 2-D jet flame 40 × 20, 0.1 s | completed, 2.1 s compute, 21 frames, 1.36 MB response |
| 2-D jet flame default 80 × 40, 0.4 s | completed, 70 s compute (75 s wall), 13 of 41 frames × 6 fields, 1.79 MB response |

## Not verified here

* Browser end-to-end on the preview itself: it is behind Vercel Authentication and no bypass token was created; the same build was tested end-to-end locally in both execution modes (above).
* Real-GPU WebGL frame rates, screen readers, Windows launchers, AI-generated Copilot text (no `ANTHROPIC_API_KEY` in this environment; retrieval mode tested).

## Benchmark re-run

`python -m backend.sim.benchmarks` in a scratch copy (so the recorded `docs/v5/benchmark_report.json` is unchanged), Python 3.12.16 / Cantera 3.2.0 / NumPy 2.2.6 / SciPy 1.15.3, about 4.5 minutes: **14/14 PASS**. ENV-USSA76 2.3e-5 · L1-EQ-CH4 2224.2 K · L1-ELEMENTS 1.8e-14 · L1-REACTOR-CONS 7.1e-15 · L2-SL-CH4 0.382 m/s · L2-SL-H2 2.344 m/s · L2-CF-CH4 2011 K · L3-VOLUME-BALANCE 1.8e-16 · L3-CAVITY-GHIA 0.0051 · L3-DIFFUSION 1.7e-4 · L3-SEALED-ADIABATIC 0.0106 · L3-BUOYANCY ±0.00545 m with no drift at 0 g · L3-GRID [0.0033, 0.0039] · CPL-SIGN exact. These match the values recorded in the ZIP's report.
