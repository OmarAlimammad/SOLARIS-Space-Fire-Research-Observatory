# SOLARIS 3.0 · Data Foundation and Data Atlas

The Data Atlas covers 11 investigations and 12 source tables. The inventory contains 1,467 CSV data rows. ACME Flame Design Normal and Inverse use separate dataset IDs, selectors, filters and exports.

## Run on Windows

Extract the release and open PowerShell in the project root, where `backend` and `frontend` are visible.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd ci --prefix frontend
npm.cmd run build --prefix frontend
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/#/explore. The release includes a production build, so the two npm commands are needed only to rebuild it from source. For frontend development, keep the API running and start `npm.cmd run dev --prefix frontend` in a second terminal. Open http://127.0.0.1:5173/#/explore.

## What changed

| Area | Change |
| --- | --- |
| `backend/scientific/foundation.py` | Dataset registry, encoding, original headers and cells, source row and line locators, hashes, data quality, field units and isolated queries. |
| `backend/scientific/routes.py` | Versioned registry, metadata, rows, row detail, summary and export endpoints. |
| `backend/main.py`, `backend/scientific/catalog.py` | Register the new API and retain legacy responses. Legacy table searches now include original source row numbers. FLEX uses Windows-1252 when UTF-8 decoding fails. |
| `frontend/src/features/data-atlas/`, `frontend/src/pages/Explore.jsx` | Dataset selector linked to shared investigation state, per-file search and AND filters, exact-value distributions, scalar summaries, coverage, inspector, pins and exports. |
| `frontend/src/pages/BassExplore.jsx` | Existing BASS-II detail dashboard and comparison workflow, available from the BASS-II source panel. |
| `frontend/src/hooks/useRemote.js`, `frontend/src/components/CatalogTable.jsx` | Request cancellation, accurate request state and source row locators in the Library. |
| `tests/`, `frontend/tests/` | Backend regression and dataset tests, plus frontend tests for file-specific state and consistent query serialization. |

The prior workspace already contained the first registry, dashboard and an earlier production build. At handoff, backend verification and packaging were pending. The old static asset regression test expected a fixed filename from the historical bundle. It now reads the generated JavaScript path from the built HTML.

## API and interpretation

- `GET /api/v1/datasets` lists investigation and file metadata. Append a dataset ID for its schema and quality summary.
- Append `/rows` for paginated results or `/rows/{source_row}` for an original data row locator. The row number is one-based after the CSV header. Physical line numbers are a separate locator.
- Append `/summary?field=...` for exact text frequencies and scalar summaries where permitted. The summary covers all matching rows in the selected file.
- Append `/export?format=csv` or `/export?format=json` for the filtered selection. The derived CSV protects spreadsheet formula-like text by prefixing an apostrophe. The JSON preserves original cell text and includes source metadata.
- Append `/original` to download source bytes with the source SHA-256 in the response. `/docs` provides the full API contract.
- Rows, summary and export accept `search` and a JSON array in `filters`. Supported operators are `eq`, `contains`, `missing`, `gte` and `lte`. Numerical comparison uses eligible scalar values in the displayed source unit.

Source notes, pre-test references, parameter listings and condition references remain visible. Coverage is computed across all source rows including these references. A row locator identifies a record in a particular file snapshot. The hash identifies that snapshot. No individual experiment count has been established.

Ranges, approximations, mixed units and ambiguous labels remain source text. SAFFIRE-III supports explicit cell suffixes for its dimensions and airflow. BASS-II instrument displays remain raw fields with scalar summaries disabled. FLEX burning-rate units require documentation. Composition validity checks cover explicitly labelled fractions and percentages. Other negative or unusual values remain as reported and need source review. The recorded provenance is limited to the supplied tables and the existing PSI-25 reference. Independent source verification, calibration, raw media and physical validation require later evidence.

## Verification

Build first, then run:

```powershell
npm.cmd test --prefix frontend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The backend suite exercises the ASGI app in process and checks all twelve original downloads, SHA-256 values, source headers, JSON cells, pagination, exact filters, summaries and derived exports. It also covers the existing compatibility, catalog, retrieval, evidence graph and timeline APIs. All twelve source files were byte-compared with the original input archive.

Release checks passed for the production build, 15 frontend tests and 18 backend tests. The PDF generation regression was skipped because ReportLab could not be installed in the verification environment. Report ID validation passed. The Windows sandbox restricted network sockets, so backend checks used ASGI in process with a test-only selector adjustment. Live desktop and mobile browser interaction remain unverified.
