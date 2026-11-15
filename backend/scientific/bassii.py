"""Loader for the original NASA PSI-25 / BASS-II experimental table.

The CSV is read-only. Values are exposed conservatively: instrument display
fields stay raw strings and are never converted to physical flow speeds.
"""
from __future__ import annotations

import csv
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = ROOT / "data" / "raw" / "bassii_nasa_original.csv"
SOURCE_URL = "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25"
DATASET_LABEL = "NASA PSI-25 / BASS-II original experimental table"

# Column -> (normalised key, label, evidence class, unit or note)
COLUMN_DICTIONARY = [
    ("PI", "pi", "Principal investigator", "experimental_metadata", None),
    ("Test #", "id", "Test identifier", "experimental_metadata", None),
    ("Date", "date", "Test date", "experimental_metadata", "M/D/YYYY as written in source"),
    ("GMT", "gmt", "GMT day (as recorded)", "experimental_metadata", "Raw value; meaning not documented in the table"),
    ("Sample #", "sample_id", "Sample number", "experimental_metadata", None),
    ("Fuel Sample Material", "fuel", "Fuel sample material (free text)", "experimental_metadata", "Unstructured description"),
    ("Flow restrictor", "flow_restrictor", "Flow restrictor setting", "instrument_setting", "Raw setting, not a flow velocity"),
    ("Fan display", "fan_display", "Fan display", "instrument_readout", "Raw display value, not calibrated cm/s"),
    ("Air display", "air_display", "Air display", "instrument_readout", "Raw display value, not calibrated cm/s"),
    ("Radiometer gain   (1000   250   50   10)", "radiometer_gain", "Radiometer gain", "instrument_setting", "One of 1000/250/50/10"),
    ("Total Frames Shot", "frames_shot", "Total still frames shot", "experimental_metadata", "Count; 'none' kept as written"),
    ("Calibrated  initial O2 % by vol ", "initial_oxygen_pct", "Initial O₂", "measured", "% by volume (calibrated, per column header)"),
    ("Calibrated final O2 % by vol", "final_oxygen_pct", "Final O₂", "measured", "% by volume (calibrated, per column header)"),
    ("Initial CO2 % by vol", "initial_co2_pct", "Initial CO₂", "measured", "% by volume"),
    ("Final CO2 % by vol", "final_co2_pct", "Final CO₂", "measured", "% by volume"),
    ("Initial CO (ppm)", "initial_co_ppm", "Initial CO", "measured", "ppm"),
    ("Final CO (ppm)", "final_co_ppm", "Final CO", "measured", "ppm"),
]


def nullable_float(value: str | None) -> float | None:
    if value is None or not str(value).strip():
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def material_group(fuel: str | None) -> str:
    """Only explicitly written material names are grouped; nothing is inferred."""
    t = (fuel or "").upper()
    if not t.strip():
        return "Not reported"
    if re.search(r"\bPMMA\b", t):
        return "PMMA (explicit)"
    if re.search(r"\bSIBAL\b", t):
        return "SIBAL (explicit)"
    if re.search(r"\bNOMEX\b", t):
        return "Nomex (explicit)"
    if re.search(r"\bWAX\b", t):
        return "Wax (explicit)"
    return "Other descriptions"


@lru_cache(maxsize=1)
def load_original_records() -> list[dict]:
    if not DATA_PATH.is_file():
        raise FileNotFoundError(f"Missing original NASA CSV at {DATA_PATH}")
    with DATA_PATH.open(encoding="utf-8-sig", newline="") as f:
        source_rows = list(csv.DictReader(f))
    records = []
    for index, row in enumerate(source_rows, start=2):  # header is line 1
        test_id = (row.get("Test #") or "").strip()
        if not test_id:
            continue
        rec = {
            "id": test_id,
            "fuel": (row.get("Fuel Sample Material") or "").strip(),
            "date": (row.get("Date") or "").strip(),
            "initial_oxygen_pct": nullable_float(row.get("Calibrated  initial O2 % by vol ")),
            "final_oxygen_pct": nullable_float(row.get("Calibrated final O2 % by vol")),
            "sample_id": (row.get("Sample #") or "").strip(),
            "flow_restrictor": (row.get("Flow restrictor") or "").strip(),
            "air_display": (row.get("Air display") or "").strip(),
            "fan_display": (row.get("Fan display") or "").strip(),
            "source_locator": f"NASA BASS-II experimental table, Test # {test_id}",
            "source_url": SOURCE_URL,
        }
        records.append(rec)
    return records


@lru_cache(maxsize=1)
def load_full_rows() -> list[dict]:
    """Every source column, keyed by the normalised names above, plus CSV line numbers."""
    with DATA_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    out = []
    for line, row in enumerate(rows, start=2):
        if not (row.get("Test #") or "").strip():
            continue
        item = {"csv_line": line}
        for col, key, _label, kind, _unit in COLUMN_DICTIONARY:
            raw = (row.get(col) or "").strip()
            item[key] = nullable_float(raw) if kind == "measured" else raw
        item["material_group"] = material_group(item["fuel"])
        out.append(item)
    return out


def records_by_id() -> dict[str, dict]:
    return {r["id"].casefold(): r for r in load_original_records()}
