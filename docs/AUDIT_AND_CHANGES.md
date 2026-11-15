# SOLARIS v2 — Audit and change log

## 1. Audit of the supplied ZIP (`SOLARIS_Research_Platform_v1.zip`)

| Area | Found | Status at audit |
|---|---|---|
| Frontend pages | Home, Discover, Explore (Data Atlas), Research, About | Built successfully |
| Library page | — | **Not present** in the ZIP |
| Cosmic Flame Lab v2 (teammate) | — | **Not present** in the ZIP |
| Backend | `main.py` (health, metadata, experiments, compatibility), `scientific/compatibility.py` | Working; 8/8 pytest passing |
| Data | `data/raw/bassii_nasa_original.csv` — 129 BASS-II rows | Only row-level dataset |
| Compatibility Engine + Evidence Passport | Present and operational | Working |
| Research tools 02–07 | Placeholder cards ("In development") | Not implemented |
| Dependencies | react 19, react-dom 19, lucide-react, vite 6 | `node_modules` in the ZIP contained macOS binaries; reinstalled |
| Extra files | Patch folders, backup folders, `.bak` files, a `dist/` build, `__pycache__` | Moved to `archive/` or removed from version control |

**Bug found:** `DataBars` in `pages/Explore.jsx` referenced an undefined `key` variable. Because the default chart (material groups) has no `value` field, rendering threw a `ReferenceError` as soon as data loaded, crashing the Data Atlas. Fixed, and chart clicks now pass the row object the handler expects.

## 2. Data verification

* PSI accessions for all 11 investigations were verified against the public NASA PSI API (`/geode-py/ws/repo/investigations/PSI-n`). The earlier list was correct (PSI-25, 69, 98, 101, 102, 107) and the rest were added: BASS PSI-26, FLEX-2 PSI-68, Saffire-II PSI-99, Saffire-III PSI-100, ACME PSI-10/20/21/22/23.
* PSI lists experimental tables for every investigation, but downloads require PSI's data-access flow. They were not imported; the UI says so.
* PSI "investigation start/end dates" are repository/programme dates (e.g. Saffire-I 2001–2008) and are shown separately from flight milestones.
* Findings are verbatim quotes, string-matched against the text of the source PDFs/pages. One curation tag (Saffire-I → SIBAL) was removed because the quoted text does not name the material.

## 3. What was built

See README for the feature table. Summary of commits on `feature/solaris-v2`:

1. Baseline import (patches and backups moved to `archive/`).
2. PSI catalog builder, metadata snapshot, verified findings.
3. Backend v2: modular services (catalog, search, graph, research, copilot, report).
4. Frontend foundation: design + motion system, resilient lazy route registry, grouped navigation, shared research state; Data Atlas crash fix.
5. Comparison Theater, Research Copilot, Evidence Universe, Report builder.
6. All seven Research Studio tools.
7. Library, Discovery Timeline, Habitat Safety Explorer.
8. Cosmic Flame Lab (three.js, lazy chunk) + teammate v2 integration point.
9. Home/Discover/About integration, API tests, responsive and accessibility fixes.

## 4. Verification performed

* `pytest`: 22 tests (8 original + 14 new integrity tests) passing.
* `node --test`: 10 tests (6 original Data Atlas + 4 flame-physics) passing.
* `vite build`: succeeds; pages are code-split, three.js is isolated in the Lab chunk.
* Headless Chromium (Playwright) end-to-end run against the dev server: all 14 routes render without console or page errors; flows tested — Data Atlas selection → Theater, Copilot question, PDF download (verified `%PDF-` header), Universe node selection, all seven Studio tools, What-If query, Library dialog, 3D Lab environment switch (WebGL), browser back navigation; no horizontal page overflow at 390 px width on 13 routes; content stays visible with `prefers-reduced-motion`; keyboard tab order starts at the skip link, dropdowns open with Enter and close with Escape.
* Not measured: Lighthouse scores, real-GPU frame rates, screen-reader output.

## 5. Known limitations / inputs still needed

* Teammate **Cosmic Flame Lab v2** archive — drop into `frontend/src/features/cosmic-flame-v2/`.
* Teammate **Library** and additional datasets — integration points documented in README.
* Experimental tables for the other ten investigations must be downloaded through NASA PSI by a person and then added as raw files with their own loaders.
* Copilot AI synthesis needs `ANTHROPIC_API_KEY` on the server; it has not been exercised against the live API in this environment (no key). Retrieval mode is fully tested.
* BASS-II video files are listed by name only; users download them from PSI and load them locally.
