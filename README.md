# SOLARIS — Research Website v1

A modular **React + CSS** frontend with a small **FastAPI** read-only adapter to the original NASA BASS-II table. This is a polished research platform foundation, not a validated combustion simulator.

## Prerequisites

- Node.js LTS and npm
- Python 3.10 or newer
- VS Code (recommended)

## Start the frontend (terminal 1)

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

## Start the NASA dataset API (terminal 2)

From the package root:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

The browser UI should update automatically. `http://localhost:8000/api/health` checks the API.

The frontend works without the backend for Home, Discover, Research Lab, and About. The Explore page gives an honest connection message until the API starts; it does not substitute fake experiment records.

## Source data

The file `data/raw/bassii_nasa_original.csv` is an unchanged copy of the original 129-row BASS-II experimental table supplied to this project. Its source is the NASA PSI-25 archive:

https://psi.nasa.gov/physci/repo/data/investigations/PSI-25

The adapter intentionally exposes only a few unambiguous fields: test ID, original material description, date, initial oxygen percentage, and **raw instrument display** fields. In particular, *Air display* is not an independently calibrated airflow value in cm/s. The original table does not provide flame spread rate. Any scientifically rigorous claims require verification of individual entries and NASA documentation.

## Architecture

```text
frontend/
  src/
    App.jsx                # page routing only
    components/            # Brand, Header, Footer, flame diagram
    pages/                 # Home, Discover, Explore, Research, About
    styles/                # global + home + internal pages
    data/                  # Research module descriptions
    lib/                   # API request functions
backend/
  main.py                  # Read-only, source-conservative FastAPI
  requirements.txt

data/raw/
  bassii_nasa_original.csv # NASA original source table
```

### Keeping the old Streamlit work

**Do not delete your existing `solaris/` project.** Extract this package into a **new** directory, e.g. `solaris-react`. Your existing Streamlit `app.py`, `app/database/loader.py`, `app/database/models.py`, and `data/raw/bassii.csv` remain untouched. The previous loader can later replace the independent API adapter after column/unit validation, without changing React's UI modules.

## Current feature status

- **Home**: polished, responsive, independent React website with qualitative interactive flame comparison.
- **Discover**: qualitative Earth vs microgravity diagram (NOT CFD, NOT real NASA imagery).
- **Explore**: working search, pagination, detail view and source links, backed by the original NASA table API.
- **Research Lab**: navigable integration previews for all 7 planned scientific tools. No simulated AI answers, no fake measurements.
- **About**: scientific provenance, sources, and caveats.

## Build verification

```powershell
cd frontend
npm run build
```

The experimental interface and algorithms will need a full domain review before real research use. The source content and educational diagrams do not independently validate physical conclusions.
