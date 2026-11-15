# SOLARIS — Space Fire Research Observatory

*Don't just watch fire in space. Investigate it.*

SOLARIS is a NASA Space Apps Challenge research platform for microgravity combustion. It turns NASA investigations into an evidence-first experience: real records, honest comparisons, sourced findings, and clearly labelled models — and, since the SOLARIS 5.0 merge, computed simulations of worlds, flames and flights that are always labelled as simulation output.

React + Vite frontend · FastAPI backend · NASA PSI source data · Cantera / NumPy / SciPy simulation engine.

> Merge record: see [docs/MERGE_FEATURE_MATRIX.md](docs/MERGE_FEATURE_MATRIX.md) (every SOLARIS 5.0 capability and its outcome) and [docs/MERGE_VERIFICATION.md](docs/MERGE_VERIFICATION.md) (checks run).

---

## What's inside

| Experience | Route | What it does | Evidence it uses |
|---|---|---|---|
| Home / Discover | `#/`, `#/discover` | Editorial introduction to microgravity combustion | NASA imagery (credited), educational diagram |
| **Cosmic Flame Lab** | `#/lab` | 3D solar system (three.js) to pick Earth / ISS / Moon / Mars; oxygen, pressure and airflow sliders; order-of-magnitude transport model and labelled flame illustration. Second tab: the teammate's *Whole Solar System* lab (every planet, points in space, sealed chamber, spacecraft acceleration) | Simplified model / educational illustration (Level 0), links to evidence or gaps |
| **Data Atlas** | `#/explore` | *BASS-II workspace*: search, filter, chart, inspect and export the 129 BASS-II rows. *All NASA source tables*: every PSI experimental table (12 files, 11 investigations) with filters, distributions, coverage, Evidence DNA passports, literal two-row comparison and CSV/JSON/original exports | Measured data + metadata (NASA PSI) |
| **Research Studio** (8 tools) | `#/research?tool=…` | Compatibility Engine + Evidence Passport, Contradiction Detector, Evidence Gap Explorer (+ scalar coverage of every table), Earth-to-Space Transfer, Uncertainty-Aware Flame Tracker, What-If Comparator, Next-Best-Experiment Advisor (+ table coverage questions), **Scientific Referee** | See below |
| **Flame Comparison Theater** | `#/theater` | Two experiments side by side, synchronized playback of NASA footage you load locally, conditions matrix, warnings, disabled unsupported numeric comparisons | BASS-II rows; PSI file listings |
| **NASA Evidence Universe** | `#/universe` | Pan/zoom knowledge graph; every edge has a meaning and a stated basis; accessible list view | PSI records, BASS-II counts, quoted findings, curated tags (marked), gaps |
| **Research Copilot** | `#/copilot` | BM25 retrieval over NASA passages; optional Claude summary with per-sentence citations | Retrieval always; AI text only when a server key is configured |
| **Space Habitat Safety Explorer** | `#/habitat` | Illustrative station / lunar / Mars cabins; material + ventilation → which evidence applies and what is missing | Findings, BASS-II counts; no risk scores |
| **One-Click Scientific Report** | `#/report` | Server-generated PDF: tables, chart, verbatim findings, Evidence Passport with SHA-256 of the input CSV | Data held by SOLARIS only |
| **Discovery Timeline** | `#/timeline` | Milestones dated by NASA sources, BASS-II test dates from the table, PSI record ranges shown separately | NASA releases / NTRS, PSI-25 table |
| **NASA Research Library** | `#/library` | 11 investigations from NASA PSI metadata with DOIs, publications, data-availability badges and links to each table in the Data Atlas | PSI public metadata snapshot |
| **World Builder** | `#/world` | Gas mixtures (mole/mass basis, humidity), thermodynamic and transport properties, effective acceleration, hydrostatic profiles for Earth, Mars, Moon, cabins, chambers, rotating habitats and custom worlds | Simulation output (Level 1) |
| **Flame Laboratory** | `#/flame` | Level 1 equilibrium and reactors, Level 2 premixed and counterflow flames (Cantera, GRI-Mech 3.0), Level 3 transient 2-D reacting flow with stored field frames | Simulation output (Levels 1–3) + Simulation Passport |
| **Flight Laboratory** | `#/flight` | Saturn V ascent baseline, LEO, lunar transfer, Earth–Mars Lambert transfer, free flight, 6-DOF demonstrator; N-body with cached JPL DE441 states; 3-D replay; runs in the browser | Simulation output (flight dynamics) |
| **Onboard Experiment** | `#/onboard` | A computed flight's specific force drives a sealed 2-D chamber flame (one-way coupling), one experiment ID | Simulation output (Level 3, coupled) |
| **Scenarios** | `#/scenarios` | Twelve runnable demonstrations with expected behaviour and acceptance checks; save your own | — |
| **Methods & Runs** | `#/methods` | Capability matrix, fidelity levels, verification benchmarks, software versions, run ledger | Model documentation |

Shared state: selected experiments, investigation, material and research question follow you between pages (session storage). A floating dock offers *Compare → Copilot → Report*.

### Research Studio tools

1. **Experiment Compatibility** — field-by-field match/differ/unknown with an Evidence Passport (`POST /api/compatibility`).
2. **Contradiction Detector** — aligns verbatim findings by configuration, gravity and method; flags only discrepancies the sources state.
3. **Evidence Gap Explorer** — material × initial-O₂ heatmap of BASS-II rows, environment and investigation coverage.
4. **Earth-to-Space Transfer** — source statements about transfer between Earth tests and microgravity, with limits.
5. **Uncertainty-Aware Flame Tracker** — in-browser intensity tracking of footage you load; threshold-sensitivity band; pixels unless you calibrate; CSV export.
6. **What-If Comparator** — "which tests were actually run with this condition changed?" Observational, never predictive.
7. **Next-Best-Experiment Advisor** — research questions derived from empty interior bins and single-replicate cells, plus questions raised by missing scalars in the other PSI tables.
8. **Scientific Referee** — checks one descriptive numeric claim (min / max / median ≥ or ≤ a value) against the eligible scalar cells of any PSI table, reporting included and excluded rows (`POST /api/v1/mission-shield/referee/number`).

The Habitat Safety Explorer also lists matching rows of the PSI tables for the chosen habitat question, and includes a verified, mass-conserving passive-tracer transport sandbox (ventilation on/off) labelled as a conceptual simulation.

---

## Data — what SOLARIS actually holds

| Investigation | NASA PSI accession | Row-level data in SOLARIS (`data/raw/`, unchanged) |
|---|---|---|
| BASS | PSI-26 | 122 rows (`bass/`) |
| **BASS-II** | **PSI-25** | **129 rows** (`bassii_nasa_original.csv`) — full analysis workspace |
| ACME | PSI-10, PSI-20, PSI-21, PSI-22, PSI-23 | PSI-10 Flame Design: 207 (normal) + 120 (inverse) rows. PSI-20–23 tables not supplied |
| FLEX | PSI-69 | 274 rows |
| FLEX-2 | PSI-68 | 8 rows (parameter listing) |
| Saffire-I / II / III | PSI-98 / PSI-99 / PSI-100 | 4 / 15 / 2 rows |
| SAME | PSI-102 | 8 rows |
| SAME-R | PSI-101 | 109 rows |
| SPICE | PSI-107 | 469 rows |

All 12 files match the experimental-table entries of the PSI public file listing by **name and byte size** (checked at runtime against `data/catalog/psi_investigations.json`); SHA-256 hashes are in `data/SOURCE_FILE_SHA256_MANIFEST.txt` and asserted by the tests. PSI publishes no hashes, so byte identity with a PSI download is not independently proven. Rows are source-table records, not necessarily individual tests; units stay exactly as written and tables are never pooled.

* `data/catalog/psi_investigations.json` — snapshot of **public** NASA PSI metadata (titles, DOIs, hardware, objectives, publications, file inventories), rebuilt with `python backend/tools/build_psi_catalog.py`.
* `data/catalog/findings.json` — 16 verbatim quotes from NASA documents (BASS-II Summary Report NASA/TM-20210011385, NTRS 20120017940, NASA releases 16-021 and 17-011). Each quote was string-matched against the source text.
* `data/catalog/timeline.json` — dated milestones, each with its NASA source and a stated date precision.

**Scientific rules enforced in code:** no fabricated measurements; `Air display`, `Fan display` and `Flow restrictor` are never converted to cm/s; no flame-spread rates, risk scores or probabilities; missing values stay missing; different conditions are never presented as causes.

Evidence classes used on every page: *Measured data · Experimental metadata · Raw instrument field · Published finding · Simplified model · Educational illustration · AI-assisted interpretation · Unavailable evidence · Simulation output*.

**Simulation rules:** every computed result carries a fidelity level and a Simulation Passport (model, assumptions, limitations, numerics, input SHA-256, software versions, verification benchmarks, validation status). Generated flame fields are **not** validated against NASA measurements; no 3-D CFD is implemented. See `#/methods` and `docs/v5/`.

---

## Run it on Windows (PowerShell)

Prerequisites: **Node.js 20+** and **Python 3.10+**.

**Terminal 1 — API**

```powershell
cd SOLARIS\backend
python -m venv ..\.venv
..\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

The simulation engine (World Builder, Flame Laboratory, Onboard Experiment) needs `numpy`, `scipy` and `cantera`, pinned in `requirements.txt` and tested on **Python 3.10 and 3.12**. Use one of those versions for the venv: on Python 3.14 with NumPy 2.5 the Cantera 3.2 wheel crashes on import. Without the engine every other page still works and `/api/v5/*` answers `503 simulation_unavailable` with instructions; the Flight Laboratory runs in the browser either way. Simulation runs are stored in `var/runs/` (override with `SOLARIS_RUN_DIR`).

If PowerShell blocks `Activate.ps1`, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

**Terminal 2 — website**

```powershell
cd SOLARIS\frontend
npm.cmd install
npm.cmd run dev
```

Open **http://localhost:5173**. Check the API at http://localhost:8000/api/health.

**Optional — AI answers in the Research Copilot** (the key stays on the server; never put it in frontend code):

```powershell
$env:ANTHROPIC_API_KEY = "your-key"
python -m uvicorn main:app --reload --port 8000
```

Optional: `$env:SOLARIS_COPILOT_MODEL` (default `claude-opus-5-5`). Without a key the Copilot runs in transparent retrieval mode.

**Tests and production build**

```powershell
# from the project root, with the venv active
python -m pip install pytest httpx
python -m pytest -q tests            # 78 tests with the engine; engine tests skip without it
python -m backend.sim.benchmarks     # optional, ~3 min: re-runs the 14 combustion/environment benchmarks (rewrites docs/v5/benchmark_report.json)

cd frontend
npm.cmd test                         # node --test: 50 tests incl. flight benchmarks and Saturn V baseline
npm.cmd run build
npm.cmd run preview   # http://localhost:4173, proxies /api to port 8000
```

**Deploying on Vercel.** `vercel.json` defines two Python functions: `api/index.py` (evidence API, 60 s) and `api/sim.py` (`/api/v5/*`, 300 s; numpy/scipy/cantera ≈ 230 MB of the 500 MB Python bundle limit). Serverless functions have no persistent disk or background processes, so the simulation API runs in **inline mode** there: each run executes inside its request within a 240 s budget (`SOLARIS_INLINE_BUDGET_S`) and the full record — manifest, result, passport, subsampled solver frames — is returned to the browser, which keeps the run ledger and saved scenarios. Long Level-3 cases need a local server (`SOLARIS_EXECUTION=jobs`, the default outside Vercel).

macOS/Linux: same commands with `source .venv/bin/activate` and `npm`.

---

## Architecture

```text
backend/
  main.py                    # entry shim: `uvicorn main:app` (from backend/) or `backend.main`
  app.py                     # FastAPI routes
  scientific/
    bassii.py                # read-only loader + column dictionary with evidence classes
    compatibility.py         # recorded-conditions comparison + Evidence Passport
  services/
    catalog.py               # investigations, findings, timeline, media listings
    search.py                # BM25 retrieval over labelled evidence
    graph.py                 # Evidence Universe nodes/edges with provenance
    research.py              # gaps, tensions, transfer, what-if, advisor
    copilot.py               # retrieval + optional Claude synthesis with citations
    report.py                # reportlab PDF
  tools/build_psi_catalog.py # refresh the PSI metadata snapshot
  scientific/tables.py         # PSI source-table registry + PSI listing check
  scientific/foundation.py     # lossless table decoding, units, row roles, filters, summaries (from 4.0)
  scientific/routes.py         # /api/v1/datasets
  scientific/mission_shield.py # passports, coverage, compare, referee, tracer transport (from 4.0)
  sim/                         # SOLARIS 5.0 engine: environment, chemistry, lowmach (L3), coupling, jobs, passport, benchmarks
  sim_mount.py                 # attaches /api/v5 (503 fallback without the engine)
api/index.py, api/sim.py       # Vercel functions (evidence API, simulation API)
scenarios/                     # 12 bundled demonstration scenarios
data/
  raw/                         # 12 NASA PSI experimental tables, unchanged
  catalog/{psi_investigations,findings,timeline}.json
  SOURCE_FILE_SHA256_MANIFEST.txt
frontend/src/
  App.jsx, routes.js         # resilient lazy route registry (import.meta.glob)
  lib/{api,router,motion}.js
  state/ResearchContext.jsx  # shared selection
  components/                # header (grouped nav), footer, ui kit, dock
  pages/                     # one file per route
  features/                  # compatibility, data-atlas, studio, cosmic-flame
  scientific/flamePhysics.js # simplified transport model (tested)
  scientific/cosmicPhysics.js # teammate whole-Solar-System lab model (tested)
  features/sim/              # simulation UI kit (live design system), plots, 3-D flight view, run ledger
  features/cosmic-flame-v2/  # teammate Cosmic Flame Lab (integration point)
  flight/                    # browser flight engine + legacy Saturn V physics (protected)
public/ephemeris, public/models  # cached JPL DE441 states, Saturn V model
  styles/system.css          # design + motion tokens
tests/                       # pytest API + integrity tests
frontend/tests/              # node:test analysis + physics tests
archive/                     # earlier patch packages and backups, kept for history
```

### Main API endpoints

`GET /api/health` · `GET /api/metadata` · `GET /api/experiments` · `GET /api/experiments/{id}` · `GET /api/experiments/{id}/media` · `GET /api/datasets/bass-ii/schema|rows` · `POST /api/compatibility` · `GET /api/investigations[/{id}]` · `GET /api/findings` · `GET /api/timeline` · `GET /api/search?q=` · `GET /api/graph` · `GET /api/research/{gaps,tensions,transfer,what-if,next-experiments}` · `POST /api/copilot` · `POST /api/report`

Source tables: `GET /api/v1/datasets[/{id}]` · `GET /api/v1/datasets/{id}/rows[/{row}]` · `…/summary?field=` · `…/export?format=csv|json` · `…/original` · MissionShield: `GET /api/v1/mission-shield/{overview,passport/{id}/{row},coverage/{id},transport}` · `POST /api/v1/mission-shield/{scenario,compare,referee/number}`

Simulation (`/api/v5`): `GET capabilities` · `GET environment/presets` · `POST mixture/{inspect,normalize}` · `POST environment/{evaluate,profile}` · `POST runs` · `POST runs/import` · `GET runs[/{id}[/result|/passport|/frames/{i}|/export]]` · `POST runs/{id}/cancel` · `POST runs/export` (hosted) · `GET|POST scenarios[/{id}]`

### Motion system

One set of duration/easing tokens (`--dur-*`, `--ease-*` in `styles/system.css`); route transitions with a progress bar and focus management; IntersectionObserver scroll reveals with staggering; sliding indicators for navigation and tabs; skeleton loaders; card/button microinteractions; animated chart fills. Only `transform`/`opacity` are animated. `prefers-reduced-motion` disables reveals, transitions, the 3D orbit animation and flame flicker.

---

## Team integration points

* **Library** — `frontend/src/pages/Library.jsx` can be replaced by the team's Library module (keep the default export).
* **Cosmic Flame Lab v2** — installed in `frontend/src/features/cosmic-flame-v2/` (from the SOLARIS 5.0 package); `#/lab` offers it as the *Whole Solar System* tab.
* **More datasets** — add raw files under `data/raw/<investigation>/` unchanged and register them in `backend/scientific/tables.py` (e.g. the missing ACME PSI-20–23 tables). They appear in the Data Atlas, MissionShield tools and Copilot retrieval automatically. Do not merge into the BASS-II schema.

---

## Sources

* NASA PSI-25 (BASS-II): https://psi.nasa.gov/physci/repo/data/investigations/PSI-25
* NASA Physical Sciences Informatics: https://psi.nasa.gov/physci/repo/
* BASS-II Summary Report, NASA/TM-20210011385: https://ntrs.nasa.gov/citations/20210011385
* Combustion, Complex Fluids, and Fluid Physics Experiments on the ISS, NTRS 20120017940
* NASA Release 16-021 (Saffire-I) and 17-011 (Saffire-III)

SOLARIS is an independent student project. NASA is a data source, not a sponsor or endorser. Images are credited to NASA/ESA on the pages where they appear.
