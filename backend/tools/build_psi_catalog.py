"""Build a provenance-preserving snapshot of public NASA PSI investigation metadata.

Usage (from the project root):
    python backend/tools/build_psi_catalog.py

What it does
------------
* Reads the PUBLIC metadata endpoint used by the NASA Physical Sciences
  Informatics (PSI) repository website:
      https://psi.nasa.gov/geode-py/ws/repo/investigations/<PSI-ID>
* Keeps only descriptive fields (title, hardware, DOI, licence, objectives,
  hypothesis, publications, file inventory). It does NOT download experimental
  data files: PSI file downloads go through PSI's own access flow, which a
  person must complete themselves.
* Writes data/catalog/psi_investigations.json with the retrieval timestamp.

Nothing in the output is invented. Fields that PSI leaves empty stay empty.
"""
from __future__ import annotations

import collections
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "catalog" / "psi_investigations.json"
API = "https://psi.nasa.gov/geode-py/ws/repo/investigations/{acc}"
PAGE = "https://psi.nasa.gov/physci/repo/data/investigations/{acc}"

# The 11 SOLARIS investigations -> PSI accession(s). ACME is a family of studies.
SOLARIS_INVESTIGATIONS = [
    ("bass", "BASS", ["PSI-26"]),
    ("bass-ii", "BASS-II", ["PSI-25"]),
    ("acme", "ACME", ["PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23"]),
    ("flex", "FLEX", ["PSI-69"]),
    ("flex-2", "FLEX-2", ["PSI-68"]),
    ("saffire-i", "Saffire-I", ["PSI-98"]),
    ("saffire-ii", "Saffire-II", ["PSI-99"]),
    ("saffire-iii", "Saffire-III", ["PSI-100"]),
    ("same", "SAME", ["PSI-102"]),
    ("same-r", "SAME-R", ["PSI-101"]),
    ("spice", "SPICE", ["PSI-107"]),
]

TEXT_FIELDS = ["objective", "hypothesis", "approach", "researchImpacts", "description"]


def fetch(acc: str) -> dict:
    req = urllib.request.Request(API.format(acc=acc), headers={"User-Agent": "SOLARIS-catalog-builder"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def clean(text: str | None) -> str:
    return re.sub(r"[ \t]+", " ", (text or "").replace("\r", "")).strip()


def file_inventory(record: dict) -> dict:
    files = record.get("added") or []
    by_category = collections.Counter()
    by_extension = collections.Counter()
    for item in files:
        parts = (item.get("remote_path") or "").split("/")
        by_category[parts[4] if len(parts) > 4 else "Uncategorised"] += 1
        by_extension[os.path.splitext(item.get("file_name") or "")[1].lower() or "(none)"] += 1
    return {
        "listed_files": len(files),
        "by_category": dict(by_category.most_common()),
        "by_extension": dict(by_extension.most_common()),
    }


def media_index(record: dict) -> dict[str, list[dict]]:
    """Map test IDs (e.g. B1) to the video file NAMES listed by PSI (no media copied)."""
    index: dict[str, list[dict]] = collections.defaultdict(list)
    for item in record.get("added") or []:
        name = item.get("file_name") or ""
        if not name.lower().endswith(".mp4"):
            continue
        match = re.search(r"TEST_([A-Za-z]+\d+[A-Za-z]?)", name)
        if not match:
            continue
        index[match.group(1).upper()].append({
            "file_name": name,
            "kind": "still_sequence" if "still_sequence" in name.lower() else "video",
            "size_bytes": item.get("file_size"),
            "subcategory": item.get("subcategory") or "",
        })
    return dict(sorted(index.items(), key=lambda kv: (re.sub(r"\d", "", kv[0]), int(re.sub(r"\D", "", kv[0]) or 0))))


def summarise(acc: str, record: dict) -> dict:
    tables = [
        {"file_name": t.get("file_name"), "size_bytes": t.get("file_size"), "restricted": bool(t.get("restricted"))}
        for t in record.get("experimentalTable") or []
    ]
    pubs = []
    for p in record.get("publications") or []:
        title = clean(p.get("title"))
        if not title:
            continue
        pubs.append({
            "title": title,
            "authors": clean(p.get("authorList")),
            "doi": clean(p.get("doi")),
            "status": ((p.get("status") or {}).get("annotationValue") or ""),
        })
    people = []
    for c in record.get("contacts") or []:
        name = " ".join(x for x in [c.get("firstName"), c.get("lastName")] if x)
        roles = [r.get("annotationValue") for r in c.get("roles") or [] if r.get("annotationValue")]
        if name:
            people.append({"name": name, "roles": roles})
    return {
        "accession": acc,
        "acronym": clean(record.get("investigationAcronym")),
        "title": clean(record.get("title")),
        "psi_url": PAGE.format(acc=acc),
        "doi": clean(record.get("doi")),
        "research_area": clean(record.get("researchArea")),
        "sub_research_area": clean(record.get("subResearchArea")),
        "hardware": clean(record.get("experimentHardware")),
        "flight_program": clean(record.get("flightProgram")),
        "managing_center": clean(record.get("managingNasaCenter")),
        "psi_record_start_date": clean(record.get("investigationStartDate")),
        "psi_record_end_date": clean(record.get("investigationEndDate")),
        "psi_release_date": clean(record.get("releaseDate")),
        "psi_modified_date": clean(record.get("modifiedDate")),
        "license": clean(record.get("licenseIdentifier")),
        "text": {k: clean(record.get(k)) for k in TEXT_FIELDS if clean(record.get(k))},
        "people": people,
        "publications": pubs,
        "experimental_tables": tables,
        "file_inventory": file_inventory(record),
        "media_by_test": media_index(record) if acc in {"PSI-25", "PSI-26"} else {},
    }


def main() -> int:
    retrieved = datetime.now(timezone.utc).isoformat(timespec="seconds")
    investigations = []
    for slug, name, accessions in SOLARIS_INVESTIGATIONS:
        records = []
        for acc in accessions:
            print(f"fetching {acc} ...", flush=True)
            records.append(summarise(acc, fetch(acc)))
            time.sleep(0.3)
        investigations.append({"id": slug, "name": name, "psi_records": records})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "NASA Physical Sciences Informatics (PSI) public investigation metadata",
        "source_api": API.format(acc="<PSI-ID>"),
        "retrieved_utc": retrieved,
        "notes": [
            "psi_record_start_date / psi_record_end_date are the dates listed on the PSI record. "
            "They are NOT necessarily flight or test dates.",
            "Experimental data files are NOT included; only their listed names and sizes.",
        ],
        "investigations": investigations,
    }, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
