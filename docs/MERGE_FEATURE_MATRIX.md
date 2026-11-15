# SOLARIS × SOLARIS 5.0 — feature matrix and merge outcomes

Baseline: live site `https://solaris-az.vercel.app` = commit `27ff2de` on `main` (the deployed bundle hashes `index-zr9lzhkq.js` / `index-B1OZGPz8.css` match a build of this commit).
Merged in: `SOLARIS_5_0_Unified_World_Flame_Flight_Source.zip` (SOLARIS 3.x → 4.0 MissionShield → 5.0 simulation lineage, diverged from the live v2 lineage at the v1 baseline).
Branch: `feature/v5-science-merge`.

Outcome keys: **Kept** (live, unchanged) · **Extended** (live implementation kept, ZIP capability added to it) · **Added** (new in the live product) · **Superseded** (ZIP version not carried because the live version does more; nothing lost) · **Deferred / blocked** (reason given).

## 1. Capabilities unique to the live site — all kept

| Capability | Route | Outcome | Verified by |
|---|---|---|---|
| Research Copilot: BM25 retrieval + optional Claude synthesis with per-sentence citations | `#/copilot` | Kept, **extended** (see §3) | pytest copilot tests; E2E question → passages |
| Evidence Universe knowledge graph with stated edge basis | `#/universe` | Kept (node data level now reflects imported tables) | E2E render |
| Flame Comparison Theater, locally loaded NASA footage | `#/theater` | Kept | E2E selection → Theater |
| Research Studio tools 02 Contradictions, 04 Transfer, 05 Flame Tracker, 06 What-If | `#/research` | Kept | sweep + E2E |
| Verified NASA findings (16 string-matched quotes), dated NASA milestones | `#/timeline`, Studio | Kept | pytest |
| NASA Research Library from PSI public metadata | `#/library` | Kept, **extended** (links to each imported table) | E2E |
| One-click PDF report with Evidence Passport + SHA-256 | `#/report` | Kept, **extended** (simulation run ledger) | E2E PDF download |
| Shared research selection + selection dock, motion system, grouped nav, skip link, reduced motion | global | Kept (nav gains a *Simulate* group built with the same component) | E2E nav, reduced-motion, mobile |
| Cosmic Flame Lab — four environments, labelled transport model | `#/lab` | Kept as the default view | E2E |

## 2. Capabilities present in both versions

| Capability | Live | ZIP | Outcome |
|---|---|---|---|
| BASS-II Compatibility Engine + Evidence Passport | ✓ | ✓ (byte-identical module) | Kept |
| BASS-II Data Atlas (charts, filters, compare, export) | full workspace | `BassExplore` dashboard | Kept live workspace; **Extended** with an *All NASA source tables* view |
| Copilot | BM25 + Claude | literal local retrieval | Live kept; ZIP's table-row retrieval **added** to the live corpus |
| Evidence graph | provenance graph | topic association graph | Superseded by live graph |
| Timeline | NASA milestones + BASS-II dates | BASS-II dates only | Superseded by live timeline |
| Scientific report | POST, multi-record, findings, chart | GET, two records | Superseded by live report; run ledger added |
| Research Studio 02–07 | implemented | partly placeholder text | Live kept; ZIP coverage questions **added** to 03 Gaps and 07 Advisor |
| Habitat explorer | evidence checklist | illustrative 2-D layout | Live kept; MissionShield scenario retrieval + tracer sandbox **added** |
| Library | PSI metadata catalog | source-table row browser | Live kept; row browsing provided by the Data Atlas and linked from each investigation |
| Cosmic Flame Lab | 4 environments | teammate's whole-Solar-System lab | Live kept as default; teammate lab **added** as a second tab via the existing `cosmic-flame-v2` integration point |

## 3. Capabilities unique to the ZIP — outcomes

| # | ZIP capability (origin) | Where it lives now | Dependencies | Outcome | Verification |
|---|---|---|---|---|---|
| 1 | 11 further NASA PSI experimental tables (BASS, ACME ×2, FLEX, FLEX-2, Saffire I–III, SAME, SAME-R, SPICE) — 1,467 rows incl. BASS-II | `data/raw/*/` (unchanged bytes, `data/SOURCE_FILE_SHA256_MANIFEST.txt`) | none | **Added** | SHA-256 manifest asserted in pytest |
| 2 | PSI provenance check (new in merge): file name + byte size vs PSI public listing | `backend/scientific/tables.py`, shown in Data Atlas | `data/catalog/psi_investigations.json` | **Added** — 12/12 match | pytest |
| 3 | Versioned source-table API: registry, schema/units/unit status, row roles, quality, filters (eq/contains/missing/≥/≤), summaries, CSV/JSON/original exports (4.0 Data Foundation) | `/api/v1/datasets…` | none | **Added** | 5.0 `test_foundation.py` (all 12 files) |
| 4 | Multi-table Data Atlas: picker, search + AND filters, exact-value distributions, scalar summaries, coverage, record explorer, pins, exports | `#/explore?view=tables` | #3 | **Added** (rebuilt in live design) | E2E search/filter/bar-filter/pagination/download |
| 5 | Evidence DNA passport per source row (MissionShield) | Data Atlas inspector | #3 | **Added** | pytest + E2E |
| 6 | Literal two-record comparison ("Paradox Explorer") | Data Atlas: pin two rows → compare | #3 | **Added** | E2E |
| 7 | Scalar-coverage gaps and next-experiment questions per table | Studio 03 Gap Explorer, 07 Advisor | #3 | **Extended** | E2E |
| 8 | Scientific Referee (deterministic numeric claim check) | Studio tool **08** | #3 | **Added** | pytest + E2E (verdict flips with claim) |
| 9 | Mission scenario evidence retrieval (environment × topic × literal term) | Habitat Safety Explorer | #3 | **Extended** | E2E |
| 10 | Verified passive-tracer 2-D transport sandbox (mass-conserving) | Habitat Safety Explorer | none | **Added**, labelled *conceptual simulation* | pytest (mass error) + E2E (ventilation changes output) |
| 11 | World Builder: mixtures (mole/mass/RH), thermo + transport properties, Earth USSA76 / Mars / Moon / cabin / rotating habitat / custom world, hydrostatic profiles | `#/world` | numpy, scipy, cantera | **Added** | 5.0 tests + E2E (density changes with world) |
| 12 | Flame Lab Level 1: equilibrium, homogeneous reactors (GRI-Mech 3.0 / h2o2) | `#/flame` | cantera | **Added** | 5.0 tests; E2E T_ad = 2225 K (ref 2226 ± 15) |
| 13 | Flame Lab Level 2: 1-D premixed and counterflow flames | `#/flame` | cantera | **Added** (≈30 s per run) | 5.0 tests |
| 14 | Flame Lab Level 3: transient 2-D low-Mach reacting flow, open/sealed, frames, budgets | `#/flame` | numpy, scipy, cantera | **Added**; hosted runs capped by a compute budget | 5.0 tests + E2E (frames render, slider changes time step) |
| 15 | Flight Lab: Saturn V legacy ascent, LEO, lunar transfer, Earth–Mars Lambert, free flight (Earth/Moon/Mars), 6-DOF demonstrator, JPL DE441 ephemeris cache, events, Δv accounting, telemetry CSV | `#/flight` (runs in the browser, Web Worker) | three.js (already a live dependency), bundled `public/ephemeris`, `public/models/SaturnV.glb` | **Added** | 5.0 Node flight benchmarks (Kepler, rocket eq., J2, Lambert, Saturn baseline bit-for-bit) + E2E |
| 16 | 3-D trajectory view with Saturn V model and 2-D fallback | Flight Lab | three.js | **Added**, restyled to the lab's dark scene | E2E (WebGL via SwiftShader) |
| 17 | Onboard experiment: flight specific force → sealed chamber (one-way coupling), shared experiment ID | `#/onboard` | #14, #15 | **Added** | 5.0 tests + E2E (both modes) |
| 18 | Twelve demonstration scenarios with acceptance checks; user-saved scenarios | `#/scenarios` | — | **Added** (hosted: saved in the browser) | Node test (all 12 well-formed, routes live) + E2E |
| 19 | Simulation Passport, run manifests, input hashes, ZIP/MD/CSV export | every lab, `#/methods`, `#/report` | — | **Added** (+ stateless export for hosted runs) | pytest + E2E downloads |
| 20 | Run ledger | `#/report`, `#/methods` | — | **Added** (server store locally, browser store when hosted) | E2E both modes |
| 21 | Capability matrix, fidelity levels, V&V benchmark tables, METHODS / VV_REPORT | `#/methods`, `docs/v5/` | — | **Added** | E2E |
| 22 | Teammate Cosmic Flame Lab (all planets, points in space, sealed chamber, spacecraft acceleration, 2-D fallback) | `#/lab` → *Whole Solar System* tab | — | **Added** through the live integration point; its 0–100 "combustion-support index" is shown as an *uncalibrated model index, not a probability* (no "%"), consistent with the live rule against probability-like scores | 5.0 `cosmic-physics.test.mjs` + E2E |
| 23 | Copilot evidence from all source tables | `#/copilot` | #1 | **Extended** (≤3 table rows per answer, deep link to the row) | pytest + E2E |
| 24 | Tools: `fetch_ephemeris.py`, `build_v5_docs.py`, `backend/sim/benchmarks.py` | `tools/`, `backend/sim/` | — | **Added** | benchmarks re-run (see verification) |
| 25 | Saturn V Flight Lab v2 reference package (baseline CSV, original physics) | `reference/saturn_v_flight_lab_v2/` | — | **Added** (regression baseline only, not deployed) | Node baseline test |
| 26 | Ctrl+K command palette | — | — | **Deferred**: needs a new header control; the live header was kept as is. Evidence search is available through the Copilot and the Data Atlas | — |
| 27 | "Nocturne" dark theme, 3.x/4.0 Home page, `MissionShield` as one standalone page | — | — | **Not carried**: the live design is the baseline; MissionShield's six tools are placed where users look for them (items 5–10) | — |
| 28 | One-origin static serving from FastAPI, Windows `.bat` launchers | — | — | **Not carried**: Vercel serves the frontend; README documents local runs | — |
| 29 | `BassExplore`, `mission.js` oxygen workbench helpers | — | — | **Superseded** by the live BASS-II workspace | — |

## 4. Partially implemented in the ZIP / remaining evidence gaps

| Item | Status | What is missing |
|---|---|---|
| Level 4 3-D reacting-flow CFD | Not implemented in the ZIP | A 3-D solver. Shown as *NOT IMPLEMENTED* on `#/methods`. |
| Validation of generated flame fields against NASA measurements | Not possible | The supplied NASA tables have no matching field data (ZIP V&V report). Labelled on every passport. |
| Moon exosphere, Coriolis in rotating habitats, two-way coupling, g-jitter, soot/radiation/solid fuels | PARTIAL / NOT IMPLEMENTED in the ZIP | Physics models; listed in the capability matrix. |
| ACME PSI-20, 21, 22, 23 tables (BRE, CLD, E-FIELD, s-Flame) | Not supplied | The four CSVs from PSI. Library and About state "2 of 6 PSI-listed tables imported". |
| Byte identity of the CSVs with the PSI downloads | Not verifiable here | PSI publishes names and sizes but no hashes; names and sizes match for 12/12. |
| Long Level-3 runs on the hosted site | Bounded | Hosted runs stop at 240 s compute (function limit 300 s) with a clear *timed out* state; local server has no limit. |
| AI-written Copilot answers | Configuration | `ANTHROPIC_API_KEY` on the server (unchanged from the live site). |

## 5. Defects found in the ZIP and fixed during the merge

* `backend/sim/chemistry.py`: `gas['O2'].X[0]` fails with NumPy ≥ 2.3 ("cannot resize an array"); replaced by `gas.X[gas.species_index('O2')]` (3 places).
* `backend/sim/passport.py`: flight passports cited `FL-EPHEM` (report id is `FL-EPHEM-INTERP`) and never loaded `flight_benchmark_report.json`, so every flight benchmark showed "not run in this installation".
* `.gitignore` excluded every `models/` directory, which would have dropped `frontend/public/models/SaturnV.glb` from the repository.
* Provenance text said "download authenticity not verified" for 11 tables; now each table states its PSI-listing check result.
