# Acknowledgments, sources and licences

| Component | Use in SOLARIS 5 | Source / licence |
|---|---|---|
| NASA PSI experiment tables (BASS-II, Saffire, SAME-R and others in `data/raw/`) | Source evidence, unchanged (SHA-256 in `SOURCE_FILE_SHA256_MANIFEST.txt`) | NASA Physical Sciences Informatics. NASA is a data source, not a sponsor or endorser. |
| Cantera 3.2.0 | Thermodynamics, kinetics, transport, 1-D flames | BSD 3-Clause. D. G. Goodwin, H. K. Moffat, I. Schoegl, R. L. Speth, B. W. Weber, https://www.cantera.org |
| GRI-Mech 3.0 | Detailed CH4/H2/CO chemistry (Levels 1–2) | G. P. Smith et al., http://combustion.berkeley.edu/gri-mech/ (as distributed with Cantera) |
| One-step rates | Level 3 chemistry | Westbrook and Dryer, Combust. Sci. Technol. 27 (1981) 31–43; Marinov, Westbrook and Pitz (1995) |
| JPL Horizons, DE441 | Cached Sun, planet and Moon states 2026–2032 | NASA/JPL Solar System Dynamics, https://ssd.jpl.nasa.gov/horizons/ |
| U.S. Standard Atmosphere 1976 | Earth reference profile | NOAA / NASA / USAF |
| Ghia, Ghia and Shin (1982) | Cavity benchmark data | J. Comput. Phys. 48, 387–411 |
| Saturn V Orbital Flight Lab V2 | Legacy ascent model, tests, baseline, user-supplied `SaturnV.glb` | Supplied by the project owner; kept unchanged in `reference/saturn_v_flight_lab_v2/` and `frontend/src/flight/legacy/`. Vehicle data references are listed in that project's README. The 3-D model is used as supplied; its original author/licence was not stated in the supplied package. |
| three.js 0.170.0 | 3-D flight view (bundled locally, no CDN) | MIT |
| React 19, Vite 6, lucide-react | Frontend | MIT / ISC |
| FastAPI, Uvicorn, Pydantic, NumPy, SciPy, ReportLab | Backend | MIT / BSD (ReportLab: BSD) |

SOLARIS is an independent student research project. Simulation results are not NASA data and are not validated against NASA experiments unless a Simulation Passport explicitly says so.
