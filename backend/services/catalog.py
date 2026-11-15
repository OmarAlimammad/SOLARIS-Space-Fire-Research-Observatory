"""Investigation catalog, published findings and timeline.

Sources:
* data/catalog/psi_investigations.json — snapshot of public NASA PSI metadata
  (built by backend/tools/build_psi_catalog.py).
* data/catalog/findings.json — verbatim, string-verified quotes from NASA documents.
* data/catalog/timeline.json — dated milestones, each with a NASA source.

Every item keeps its provenance. SOLARIS-authored text is limited to short
labels and is marked with ``"authored_by": "SOLARIS"``.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ..scientific.bassii import load_original_records

ROOT = Path(__file__).resolve().parents[2]
CATALOG_DIR = ROOT / "data" / "catalog"

# Short SOLARIS profile per investigation: a phase/configuration label and the
# document that supports it. Only used for grouping and filtering.
PROFILES = {
    "bass": {"fuel_phase": "solid", "configuration": "Small flow duct in the MSG", "venue": "ISS",
             "support": "https://ntrs.nasa.gov/citations/20210011385"},
    "bass-ii": {"fuel_phase": "solid", "configuration": "Small flow duct in the MSG", "venue": "ISS",
                "support": "https://ntrs.nasa.gov/citations/20210011385"},
    "acme": {"fuel_phase": "gas", "configuration": "Gaseous-fuel laminar flames in the CIR", "venue": "ISS",
             "support": "https://ntrs.nasa.gov/citations/20210021781"},
    "flex": {"fuel_phase": "liquid", "configuration": "Isolated droplet combustion (MDCA in the CIR)", "venue": "ISS",
             "support": "https://ntrs.nasa.gov/citations/20120017940"},
    "flex-2": {"fuel_phase": "liquid", "configuration": "Isolated droplet combustion (MDCA in the CIR)", "venue": "ISS",
               "support": "https://ntrs.nasa.gov/citations/20120017940"},
    "saffire-i": {"fuel_phase": "solid", "configuration": "Large-scale material burn in a departing Cygnus", "venue": "Cygnus (uncrewed)",
                  "support": "https://www.nasa.gov/news-release/nasa-glenn-successfully-ignites-largest-fire-experiment-in-space"},
    "saffire-ii": {"fuel_phase": "solid", "configuration": "Large-scale material burn in a departing Cygnus", "venue": "Cygnus (uncrewed)",
                   "support": "https://www.nasa.gov/news-release/nasa-prepares-to-ignite-third-saffire-experiment"},
    "saffire-iii": {"fuel_phase": "solid", "configuration": "Large-scale material burn in a departing Cygnus", "venue": "Cygnus (uncrewed)",
                    "support": "https://www.nasa.gov/news-release/nasa-prepares-to-ignite-third-saffire-experiment"},
    "same": {"fuel_phase": "smoke", "configuration": "Smoke particle measurement from heated materials", "venue": "ISS",
             "support": "https://ntrs.nasa.gov/citations/20120017940"},
    "same-r": {"fuel_phase": "smoke", "configuration": "Smoke particle measurement (reflight)", "venue": "ISS",
               "support": "https://ntrs.nasa.gov/citations/20120017940"},
    "spice": {"fuel_phase": "gas", "configuration": "Laminar gas-jet diffusion flames in the MSG", "venue": "ISS",
              "support": "https://ntrs.nasa.gov/citations/20120017940"},
}

# Follow-on relationships stated by the investigation names / PSI "related" field.
FOLLOW_ON = [
    ("bass-ii", "bass", "PSI-25 record lists PSI-26 (BASS) as related; BASS-II is the second BASS investigation."),
    ("flex-2", "flex", "PSI-68 objective: 'extend the results of FLEX-1'."),
    ("same-r", "same", "PSI-101 objective: 'Similar to the original SAME investigation'. SAME-R is the reflight."),
    ("saffire-ii", "saffire-i", "Part of the Saffire series (NASA Release 17-011)."),
    ("saffire-iii", "saffire-ii", "Part of the Saffire series (NASA Release 17-011)."),
]


@lru_cache(maxsize=1)
def psi_snapshot() -> dict:
    return json.loads((CATALOG_DIR / "psi_investigations.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def findings() -> list[dict]:
    return json.loads((CATALOG_DIR / "findings.json").read_text(encoding="utf-8"))["findings"]


@lru_cache(maxsize=1)
def timeline_events() -> list[dict]:
    return json.loads((CATALOG_DIR / "timeline.json").read_text(encoding="utf-8"))["events"]


def _source_tables(inv_id: str) -> list[dict]:
    """Row-level NASA PSI tables held in data/raw/ for this investigation (from the source-table registry)."""
    try:
        from ..scientific.foundation import registry
    except ImportError:  # pragma: no cover
        return []
    out = []
    for d in registry()["items"]:
        if d.get("site_investigation") != inv_id or not d.get("available"):
            continue
        listing = d.get("psi_listing") or {}
        out.append({"dataset_id": d["id"], "variant": d["variant"], "rows": d["row_count"], "file": f"data/raw/{d['file']}",
                    "sha256": d["sha256"], "accession": d["accession"], "psi_listing_status": listing.get("status"),
                    "psi_listed_name": listing.get("listed_name")})
    return out


def _data_status(inv_id: str, records: list[dict]) -> dict:
    tables = [t for r in records for t in r["experimental_tables"]]
    media = sum(r["file_inventory"]["by_extension"].get(".mp4", 0) for r in records)
    held = _source_tables(inv_id)
    if inv_id == "bass-ii":
        rows = len(load_original_records())
        return {
            "level": "row_level_imported",
            "label": "Row-level experimental table imported",
            "imported_rows": rows,
            "imported_file": "data/raw/bassii_nasa_original.csv",
            "source_tables": held,
            "tables_imported": len(held),
            "psi_tables": tables,
            "psi_listed_videos": media,
            "note": "Unchanged copy of the PSI-25 experimental table. Flame-spread rates are not part of this table.",
        }
    if held:
        missing = [t["file_name"] for t in tables if t["file_name"] not in {h["psi_listed_name"] for h in held}]
        return {
            "level": "row_level_imported",
            "label": "Row-level experimental table imported" if not missing else f"{len(held)} of {len(tables)} PSI-listed tables imported",
            "imported_rows": sum(h["rows"] for h in held),
            "imported_file": held[0]["file"],
            "source_tables": held,
            "tables_imported": len(held),
            "tables_not_imported": missing,
            "psi_tables": tables,
            "psi_listed_videos": media,
            "note": ("Unchanged copy of the PSI experimental table" + ("s" if len(held) > 1 else "") + "; file name and byte size match the PSI listing. "
                     "Rows are source-table records (not necessarily individual tests). Units are kept as written; nothing is converted or pooled with BASS-II."
                     + (f" Not imported: {', '.join(missing)}." if missing else "")),
        }
    return {
        "level": "catalog_only",
        "label": "Catalog metadata only",
        "imported_rows": 0,
        "imported_file": None,
        "source_tables": [],
        "tables_imported": 0,
        "psi_tables": tables,
        "psi_listed_videos": media,
        "note": "PSI lists an experimental table for this investigation, but it has not been imported into SOLARIS. "
                "Downloads go through the PSI repository's own access flow.",
    }


def _excerpt(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + " …"


def investigations() -> list[dict]:
    snap = psi_snapshot()
    out = []
    for inv in snap["investigations"]:
        recs = inv["psi_records"]
        primary = recs[0]
        inv_findings = [f["id"] for f in findings() if f["investigation"] == inv["id"]]
        out.append({
            "id": inv["id"],
            "name": inv["name"],
            "title": primary["title"] if len(recs) == 1 else "Advanced Combustion via Microgravity Experiments",
            "accessions": [r["accession"] for r in recs],
            "psi_url": primary["psi_url"],
            "doi": primary["doi"],
            "hardware": primary["hardware"],
            "managing_center": primary["managing_center"],
            "profile": {**PROFILES.get(inv["id"], {}), "authored_by": "SOLARIS"},
            "publication_count": sum(len(r["publications"]) for r in recs),
            "finding_ids": inv_findings,
            "data_status": _data_status(inv["id"], recs),
            "summary": _excerpt(primary["text"].get("objective", ""), 420),
            "summary_source": f"PSI record {primary['accession']} — objective field",
        })
    return out


def investigation(inv_id: str) -> dict | None:
    snap = psi_snapshot()
    for inv in snap["investigations"]:
        if inv["id"] == inv_id:
            base = next(i for i in investigations() if i["id"] == inv_id)
            return {
                **base,
                "psi_records": inv["psi_records"],
                "findings": [f for f in findings() if f["investigation"] == inv_id],
                "follow_on": [
                    {"from": a, "to": b, "basis": basis}
                    for a, b, basis in FOLLOW_ON if inv_id in (a, b)
                ],
                "retrieved_utc": snap["retrieved_utc"],
            }
    return None


def media_for_test(test_id: str) -> dict:
    """Video file NAMES that PSI lists for a BASS-II test. No media is copied or proxied."""
    snap = psi_snapshot()
    rec = next(r for i in snap["investigations"] if i["id"] == "bass-ii" for r in i["psi_records"])
    items = rec["media_by_test"].get(test_id.strip().upper(), [])
    return {
        "test_id": test_id.strip().upper(),
        "investigation": "BASS-II (PSI-25)",
        "psi_url": rec["psi_url"],
        "files": items,
        "access_note": "Files are listed by NASA PSI. Download them from the PSI repository, then load them locally "
                       "in the Comparison Theater. SOLARIS does not host or alter NASA footage.",
        "retrieved_utc": snap["retrieved_utc"],
    }
