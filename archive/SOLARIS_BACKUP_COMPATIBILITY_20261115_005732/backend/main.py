"""Read-only FastAPI adapter for the original NASA PSI-25 / BASS-II table.

This API exposes source columns conservatively. Instrument display values are NOT
converted to physical flow speeds and missing flame measurements are NOT invented.
The science/AI engines can be integrated later, independently of the frontend.
"""
from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "raw" / "bassii_nasa_original.csv"
SOURCE_URL = "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25"

app = FastAPI(title="SOLARIS Source Data API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def nullable_float(value: str | None) -> float | None:
    if value is None or not value.strip():
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


@lru_cache(maxsize=1)
def load_original_records() -> list[dict]:
    if not DATA_PATH.is_file():
        raise FileNotFoundError(f"Missing original NASA CSV at {DATA_PATH}")
    with DATA_PATH.open(encoding="utf-8-sig", newline="") as f:
        source_rows = list(csv.DictReader(f))
    records = []
    for row in source_rows:
        test_id = (row.get("Test #") or "").strip()
        if not test_id:
            continue
        records.append({
            "id": test_id,
            "fuel": (row.get("Fuel Sample Material") or "").strip(),
            "date": (row.get("Date") or "").strip(),
            "initial_oxygen_pct": nullable_float(row.get("Calibrated  initial O2 % by vol ")),
            "air_display": (row.get("Air display") or "").strip(),
            "fan_display": (row.get("Fan display") or "").strip(),
            "source_locator": f"NASA BASS-II experimental table, Test # {test_id}",
            "source_url": SOURCE_URL,
        })
    return records


def records_or_503():
    try:
        return load_original_records()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/health")
def health():
    return {"status": "ok", "source_data_available": DATA_PATH.is_file()}


@app.get("/api/metadata")
def metadata():
    rows = records_or_503()
    return {
        "total_records": len(rows),
        "dataset": "NASA PSI-25 / BASS-II original experimental table",
        "initial_oxygen_present": sum(r["initial_oxygen_pct"] is not None for r in rows),
        "unique_fuel_descriptions": len({r["fuel"] for r in rows if r["fuel"]}),
        "source_url": SOURCE_URL,
        "scientific_warning": "Air display and fan display are instrument fields, not verified cm/s speed.",
    }


@app.get("/api/experiments")
def experiments(search: str = "", offset: int = Query(0, ge=0), limit: int = Query(24, ge=1, le=500)):
    rows = records_or_503()
    term = search.strip().casefold()
    if term:
        rows = [r for r in rows if term in r["id"].casefold() or term in r["fuel"].casefold()]
    return {"total": len(rows), "offset": offset, "limit": limit, "items": rows[offset: offset + limit]}


@app.get("/api/experiments/{experiment_id}")
def experiment(experiment_id: str):
    for row in records_or_503():
        if row["id"].casefold() == experiment_id.strip().casefold():
            return row
    raise HTTPException(status_code=404, detail="Experiment not found")
