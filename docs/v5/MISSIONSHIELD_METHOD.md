# MissionShield — scientific methodology and verification boundaries

## Data contract

The system retains 12 raw CSV sources for 11 NASA investigation names. Source bytes and column text are not modified by MissionShield. Dataset IDs and SHA-256 provenance are supplied by the already present `scientific.foundation` registry. Row records are not automatically independent experimental runs; where possible, known source-note and parameter-listing rows are distinguished from source records.

The new research endpoints are versioned under `/api/v1/mission-shield`:

| Method | Endpoint | Evidence contract |
|---|---|---|
| GET | `/overview` | Verified local file inventory, not experiment count |
| POST | `/scenario` | Explicit topic-indexed source matches; no hazard prediction |
| GET | `/passport/{dataset_id}/{source_row}` | Original row field strings, SHA-256, physical CSV line span |
| GET | `/coverage/{dataset_id}` | Eligible scalar coverage for source-record rows only |
| POST | `/compare` | Literal field comparisons; no automatic scientific contradiction |
| POST | `/referee/number` | Deterministic max/min/median claim check on finite eligible scalars |
| GET | `/transport` | Dimensionless passive-tracer simulation on periodic reference domain |

All endpoints return human-readable evidence limitations. Scenario field `source_term` is a literal local text search, **not** synonym or physics-based material matching. Dataset-topic associations identify research areas only.

## Passive scalar numerical method

The reference transport sandbox approximates:

\[\partial_t c + u(y)\partial_x c = D(\partial_{xx}c + \partial_{yy}c)\]

with prescribed shear `u(y) = U sin(2πy/H)`, no y velocity, an initial Gaussian tracer, and periodic x/y boundaries. This is a 2D **advection–diffusion** solver, not solved Navier–Stokes, pyrolysis, reactive flow, or real space-habitat smoke CFD. The scheme uses explicit 1st-order upwind advection and a centered Laplacian; `dt=0.05`, `dx=dy=1`, `D=0.16`, `U=0` or `0.8`. It monitors a positivity/CFL sufficient bound `dt (|U|/dx + 4D/dx²) ≤ 1`. Returned fields are dimensionless and use arbitrary length/time scales.

A periodic tracer domain has **no actual walls or physical air ducts** and cannot estimate a spacecraft detector signal. Its primary purpose is teaching the difference between numerical results and illustrative animation, and offering a benchmarkable computational foundation. The solver exposes total tracer mass and relative mass error. Numerical tests assert mass preservation, non-negativity, stability margin, bounded API parameters and variation with prescribed shear. Numerical conservation is not equivalent to experimental validation.

## Key scientific limitations

- Available CSVs are primarily heterogeneous experiment tables. Many are not time-resolved calibrated measurements.
- Original download provenance has been identified for BASS-II in the existing project; other sources still require independent authenticity and source-link verification.
- Some headings, descriptors and ranges do not permit scalar summaries.
- No inferred airspeed from fan voltage or air-display text.
- No lunar/Martian safety certification based on orbital free-fall data.
- No experimental spacecraft fire probability, toxicity score, flame speed, reaction rate or sensor detection prediction.
- Full 2D Navier–Stokes or 3D reacting CFD, NASA/JPL orbital ephemeris verification, external AI provider and complete mobile/browser accessibility verification remain separate engineering milestones.

## Running automated checks

```bash
python -m pytest -q tests
cd frontend && npm test
```

A fresh Vite build requires `npm.cmd ci && npm.cmd run build` on Windows or `npm ci && npm run build` on Linux/macOS with npm registry access.
