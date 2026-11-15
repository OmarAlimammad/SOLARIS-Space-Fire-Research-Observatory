# SOLARIS — Space Fire Research Observatory

*Don't just watch fire in space. Investigate it.*

SOLARIS is a NASA Space Apps Challenge research platform for microgravity combustion. It turns NASA investigations into an evidence-first experience: real records, honest comparisons, sourced findings, and clearly labelled models.

React + Vite frontend · FastAPI backend · NASA PSI source data.

---

## What's inside

| Experience | Route | What it does | Evidence it uses |
|---|---|---|---|
| Home / Discover | `#/`, `#/discover` | Editorial introduction to microgravity combustion | NASA imagery (credited), educational diagram |
| **Cosmic Flame Lab** | `#/lab` | 3D solar system (three.js) to pick Earth / ISS / Moon / Mars; oxygen, pressure and airflow sliders; order-of-magnitude transport model and labelled flame illustration | Simplified model (uncalibrated), links to evidence or gaps |
| **Data Atlas** | `#/explore` | Search, filter, chart, inspect and export the 129 BASS-II rows | Measured data + metadata (NASA PSI-25) |
| **Research Studio** (7 tools) | `#/research?tool=…` | Compatibility Engine + Evidence Passport, Contradiction Detector, Evidence Gap Explorer, Earth-to-Space Transfer, Uncertainty-Aware Flame Tracker, What-If Comparator, Next-Best-Experiment Advisor | See below |
| **Flame Comparison Theater** | `#/theater` | Two experiments side by side, synchronized playback of NASA footage you load locally, conditions matrix, warnings, disabled unsupported numeric comparisons | BASS-II rows; PSI file listings |
| **NASA Evidence Universe** | `#/universe` | Pan/zoom knowledge graph; every edge has a meaning and a stated basis; accessible list view | PSI records, BASS-II counts, quoted findings, curated tags (marked), gaps |
| **Research Copilot** | `#/copilot` | BM25 retrieval over NASA passages; optional Claude summary with per-sentence citations | Retrieval always; AI text only when a server key is configured |
| **Space Habitat Safety Explorer** | `#/habitat` | Illustrative station / lunar / Mars cabins; material + ventilation → which evidence applies and what is missing | Findings, BASS-II counts; no risk scores |
| **One-Click Scientific Report** | `#/report` | Server-generated PDF: tables, chart, verbatim findings, Evidence Passport with SHA-256 of the input CSV | Data held by SOLARIS only |
| **Discovery Timeline** | `#/timeline` | Milestones dated by NASA sources, BASS-II test dates from the table, PSI record ranges shown separately | NASA releases / NTRS, PSI-25 table |
| **NASA Research Library** | `#/library` | 11 investigations from NASA PSI metadata with DOIs, publications, data-availability badges | PSI public metadata snapshot |

Shared state: selected experiments, investigation, material and research question follow you between pages (session storage). A floating dock offers *Compare → Copilot → Report*.

### Research Studio tools

1. **Experiment Compatibility** — field-by-field match/differ/unknown with an Evidence Passport (`POST /api/compatibility`).
2. **Contradiction Detector** — aligns verbatim findings by configuration, gravity and method; flags only discrepancies the sources state.
3. **Evidence Gap Explorer** — material × initial-O₂ heatmap of BASS-II rows, environment and investigation coverage.
4. **Earth-to-Space Transfer** — source statements about transfer between Earth tests and microgravity, with limits.
5. **Uncertainty-Aware Flame Tracker** — in-browser intensity tracking of footage you load; threshold-sensitivity band; pixels unless you calibrate; CSV export.
6. **What-If Comparator** — "which tests were actually run with this condition changed?" Observational, never predictive.
7. **Next-Best-Experiment Advisor** — research questions derived from empty interior bins and single-replicate cells.

---

## Data — what SOLARIS actually holds

| Investigation | NASA PSI accession | Row-level data in SOLARIS |
|---|---|---|
| BASS | PSI-26 | catalog only |
| **BASS-II** | **PSI-25** | **129 rows** (`data/raw/bassii_nasa_original.csv`, unchanged) |
| ACME | PSI-10, PSI-20, PSI-21, PSI-22, PSI-23 | catalog only |
| FLEX | PSI-69 | catalog only |
| FLEX-2 | PSI-68 | catalog only |
| Saffire-I / II / III | PSI-98 / PSI-99 / PSI-100 | catalog only |
| SAME | PSI-102 | catalog only |
| SAME-R | PSI-101 | catalog only |
| SPICE | PSI-107 | catalog only |

* `data/catalog/psi_investigations.json` — snapshot of **public** NASA PSI metadata (titles, DOIs, hardware, objectives, publications, file inventories), rebuilt with `python backend/tools/build_psi_catalog.py`. PSI lists an experimental table for every investigation; downloading those files goes through PSI's own access flow, so they are **not** imported.
* `data/catalog/findings.json` — 16 verbatim quotes from NASA documents (BASS-II Summary Report NASA/TM-20210011385, NTRS 20120017940, NASA releases 16-021 and 17-011). Each quote was string-matched against the source text.
* `data/catalog/timeline.json` — dated milestones, each with its NASA source and a stated date precision.

**Scientific rules enforced in code:** no fabricated measurements; `Air display`, `Fan display` and `Flow restrictor` are never converted to cm/s; no flame-spread rates, risk scores or probabilities; missing values stay missing; different conditions are never presented as causes.

Evidence classes used on every page: *Measured data · Experimental metadata · Raw instrument field · Published finding · Simplified model · Educational illustration · AI-assisted interpretation · Unavailable evidence*.

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
python -m pytest -q tests

cd frontend
node --test tests/
npm.cmd run build
npm.cmd run preview   # http://localhost:4173, proxies /api to port 8000
```

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
data/
  raw/bassii_nasa_original.csv
  catalog/{psi_investigations,findings,timeline}.json
frontend/src/
  App.jsx, routes.js         # resilient lazy route registry (import.meta.glob)
  lib/{api,router,motion}.js
  state/ResearchContext.jsx  # shared selection
  components/                # header (grouped nav), footer, ui kit, dock
  pages/                     # one file per route
  features/                  # compatibility, data-atlas, studio, cosmic-flame
  scientific/flamePhysics.js # simplified transport model (tested)
  styles/system.css          # design + motion tokens
tests/                       # pytest API + integrity tests
frontend/tests/              # node:test analysis + physics tests
archive/                     # earlier patch packages and backups, kept for history
```

### Main API endpoints

`GET /api/health` · `GET /api/metadata` · `GET /api/experiments` · `GET /api/experiments/{id}` · `GET /api/experiments/{id}/media` · `GET /api/datasets/bass-ii/schema|rows` · `POST /api/compatibility` · `GET /api/investigations[/{id}]` · `GET /api/findings` · `GET /api/timeline` · `GET /api/search?q=` · `GET /api/graph` · `GET /api/research/{gaps,tensions,transfer,what-if,next-experiments}` · `POST /api/copilot` · `POST /api/report`

### Motion system

One set of duration/easing tokens (`--dur-*`, `--ease-*` in `styles/system.css`); route transitions with a progress bar and focus management; IntersectionObserver scroll reveals with staggering; sliding indicators for navigation and tabs; skeleton loaders; card/button microinteractions; animated chart fills. Only `transform`/`opacity` are animated. `prefers-reduced-motion` disables reveals, transitions, the 3D orbit animation and flame flicker.

---

## Team integration points

* **Library** — `frontend/src/pages/Library.jsx` can be replaced by the team's Library module (keep the default export).
* **Cosmic Flame Lab v2** — place the teammate package in `frontend/src/features/cosmic-flame-v2/` with an `index.jsx` default export. `#/lab` detects it automatically and offers it beside the SOLARIS lab. The v2 archive was not part of the supplied ZIP.
* **More datasets** — add raw files under `data/raw/<investigation>/` unchanged, then add a loader in `backend/scientific/` with its own column dictionary. Do not merge into the BASS-II schema.

---

## Sources

* NASA PSI-25 (BASS-II): https://psi.nasa.gov/physci/repo/data/investigations/PSI-25
* NASA Physical Sciences Informatics: https://psi.nasa.gov/physci/repo/
* BASS-II Summary Report, NASA/TM-20210011385: https://ntrs.nasa.gov/citations/20210011385
* Combustion, Complex Fluids, and Fluid Physics Experiments on the ISS, NTRS 20120017940
* NASA Release 16-021 (Saffire-I) and 17-011 (Saffire-III)

SOLARIS is an independent student project. NASA is a data source, not a sponsor or endorser. Images are credited to NASA/ESA on the pages where they appear.
