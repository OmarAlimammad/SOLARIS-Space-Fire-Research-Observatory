"""SOLARIS Research API.

Read-only and source-conservative. Instrument display values are NOT converted to
physical flow speeds and missing flame measurements are NOT invented.

Run from backend/:   python -m uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .scientific.bassii import (COLUMN_DICTIONARY, DATA_PATH, DATASET_LABEL, SOURCE_URL, load_full_rows,
                                load_original_records, records_by_id)
from .scientific.compatibility import build_comparison
from .services import catalog, copilot, graph, research, search

app = FastAPI(title="SOLARIS Research API", version="2.0.0")
_origins = os.environ.get("SOLARIS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def records_or_503():
    try:
        return load_original_records()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# --------------------------------------------------------------------------- health / BASS-II

@app.get("/api/health")
def health():
    return {"status": "ok", "source_data_available": DATA_PATH.is_file(), "copilot_llm": copilot.llm_provider() is not None,
            "copilot_provider": copilot.llm_provider()}


@app.get("/api/metadata")
def metadata():
    rows = records_or_503()
    return {
        "total_records": len(rows),
        "dataset": DATASET_LABEL,
        "initial_oxygen_present": sum(r["initial_oxygen_pct"] is not None for r in rows),
        "unique_fuel_descriptions": len({r["fuel"] for r in rows if r["fuel"]}),
        "source_url": SOURCE_URL,
        "scientific_warning": "Air display and fan display are instrument fields, not verified cm/s speed.",
    }


@app.get("/api/experiments")
def experiments(search_text: str = Query("", alias="search"), offset: int = Query(0, ge=0), limit: int = Query(24, ge=1, le=500)):
    rows = records_or_503()
    term = search_text.strip().casefold()
    if term:
        rows = [r for r in rows if term in r["id"].casefold() or term in r["fuel"].casefold()]
    return {"total": len(rows), "offset": offset, "limit": limit, "items": rows[offset: offset + limit]}


@app.get("/api/experiments/{experiment_id}")
def experiment(experiment_id: str):
    for row in records_or_503():
        if row["id"].casefold() == experiment_id.strip().casefold():
            return row
    raise HTTPException(status_code=404, detail="Experiment not found")


@app.get("/api/experiments/{experiment_id}/media")
def experiment_media(experiment_id: str):
    if experiment_id.strip().casefold() not in records_by_id():
        raise HTTPException(status_code=404, detail="Experiment not found")
    return catalog.media_for_test(experiment_id)


@app.get("/api/datasets/bass-ii/schema")
def bassii_schema():
    """Column dictionary with evidence classes. Lets every UI label fields honestly."""
    return {
        "dataset": DATASET_LABEL,
        "source_url": SOURCE_URL,
        "columns": [{"source_column": c, "key": k, "label": l, "evidence_class": kind, "unit_or_note": u}
                    for c, k, l, kind, u in COLUMN_DICTIONARY],
    }


@app.get("/api/datasets/bass-ii/rows")
def bassii_rows():
    return {"dataset": DATASET_LABEL, "source_url": SOURCE_URL, "rows": load_full_rows()}


class CompatibilityRequest(BaseModel):
    """Two source IDs; no arbitrary fabricated experimental input."""
    first_id: str = Field(min_length=1, max_length=80)
    second_id: str = Field(min_length=1, max_length=80)


@app.post("/api/compatibility")
def compare_recorded_conditions(request: CompatibilityRequest):
    """Compare BASS-II source metadata and generate an evidence passport.

    This does not assess flame-spread rates, fire risk or physical equivalence.
    """
    first_id = request.first_id.strip().casefold()
    second_id = request.second_id.strip().casefold()
    if not first_id or not second_id or first_id == second_id:
        raise HTTPException(status_code=422, detail="Select two distinct experiment IDs.")
    by_id = {record["id"].casefold(): record for record in records_or_503()}
    if first_id not in by_id or second_id not in by_id:
        raise HTTPException(status_code=404, detail="One or both experiment IDs were not found in NASA BASS-II records.")
    return build_comparison(by_id[first_id], by_id[second_id])


# --------------------------------------------------------------------------- catalog

@app.get("/api/investigations")
def list_investigations():
    snap = catalog.psi_snapshot()
    return {"retrieved_utc": snap["retrieved_utc"], "source": snap["source"], "notes": snap["notes"],
            "items": catalog.investigations()}


@app.get("/api/investigations/{inv_id}")
def get_investigation(inv_id: str):
    item = catalog.investigation(inv_id.strip().lower())
    if not item:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return item


@app.get("/api/findings")
def list_findings(investigation: str | None = None, concept: str | None = None):
    items = catalog.findings()
    if investigation:
        items = [f for f in items if f["investigation"] == investigation]
    if concept:
        items = [f for f in items if concept in f["concepts"]]
    return {"items": items}


@app.get("/api/timeline")
def timeline():
    rows = records_or_503()
    dated = []
    for r in rows:
        parts = r["date"].split("/")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            dated.append((f"{int(parts[2]):04d}-{int(parts[0]):02d}-{int(parts[1]):02d}", r["id"]))
    dated.sort()
    by_year: dict[str, list[str]] = {}
    for d, rid in dated:
        by_year.setdefault(d[:4], []).append(rid)
    data_events = [{
        "id": f"bass-ii-tests-{year}", "date": next(d for d, rid in dated if d.startswith(year)), "precision": "day",
        "investigation": "bass-ii", "kind": "data",
        "title": f"{len(ids)} dated BASS-II test row(s) in {year}",
        "summary": f"First dated row {next(d for d, _ in dated if d.startswith(year))}, last {[d for d, _ in dated if d.startswith(year)][-1]}. "
                   "Dates are read from the 'Date' column of the NASA table.",
        "record_ids": ids,
        "source": {"label": "NASA PSI-25 experimental table", "url": SOURCE_URL},
    } for year, ids in by_year.items()]
    psi_ranges = [{"investigation": i["id"], "name": i["name"], "records": [
        {"accession": r["accession"], "start": r["psi_record_start_date"], "end": r["psi_record_end_date"]}
        for r in catalog.investigation(i["id"])["psi_records"]]} for i in catalog.investigations()]
    return {"events": sorted(catalog.timeline_events() + data_events, key=lambda e: e["date"]),
            "psi_record_ranges": psi_ranges,
            "notes": ["Milestones are dated by the cited NASA source.",
                      "PSI record dates are repository/programme dates and are shown separately — they are not flight dates."]}


# --------------------------------------------------------------------------- research tools

@app.get("/api/search")
def search_evidence(q: str = Query(..., min_length=1, max_length=300), limit: int = Query(12, ge=1, le=50),
                    types: str | None = None, investigation: str | None = None):
    type_set = {t.strip() for t in types.split(",")} if types else None
    return {"query": q, "results": search.search(q, limit=limit, types=type_set, investigation=investigation)}


@app.get("/api/graph")
def evidence_graph():
    return graph.build_graph()


@app.get("/api/research/gaps")
def gaps():
    return research.evidence_gaps()


@app.get("/api/research/tensions")
def tensions(concept: str = "flammability-limit"):
    return research.tensions(concept)


@app.get("/api/research/transfer")
def transfer():
    return research.transfer_evidence()


@app.get("/api/research/what-if")
def what_if(base: str, change: str, value: str | None = None):
    result = research.what_if(base, change, value)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result


@app.get("/api/research/next-experiments")
def next_experiments():
    return research.next_experiments()


class CopilotRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    selected_ids: list[str] = Field(default_factory=list, max_length=6)


@app.post("/api/copilot")
def ask_copilot(request: CopilotRequest):
    return copilot.answer(request.question, request.selected_ids)


class ReportRequest(BaseModel):
    question: str = Field(default="", max_length=300)
    record_ids: list[str] = Field(default_factory=list, max_length=12)
    investigation: str = Field(default="bass-ii", max_length=40)
    include_findings: bool = True
    notes: str = Field(default="", max_length=3000)


@app.post("/api/report")
def make_report(request: ReportRequest):
    try:
        from .services.report import build_report
    except ImportError as exc:  # reportlab missing
        raise HTTPException(status_code=503, detail="PDF generation requires the 'reportlab' package (pip install -r requirements.txt).") from exc
    pdf, meta = build_report(request.question, request.record_ids, request.investigation, request.include_findings, request.notes)
    stamp = meta["generated_utc"][:19].replace(":", "").replace("-", "")
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="SOLARIS_report_{stamp}.pdf"',
        "X-SOLARIS-CSV-SHA256": meta["csv_sha256"],
    })


# --------------------------------------------------------------------------- source tables (merged from SOLARIS 4.0/5.0)
# Versioned, lossless access to every NASA PSI experimental table in data/raw/ (registry, rows, summaries,
# exports, original bytes) and the MissionShield evidence tools (record passports, literal record comparison,
# scalar-coverage questions, numeric claim referee, passive-tracer transport sandbox).
from .scientific.mission_shield import router as _mission_shield_router  # noqa: E402
from .scientific.routes import router as _source_table_router  # noqa: E402

app.include_router(_source_table_router)
app.include_router(_mission_shield_router)


# --------------------------------------------------------------------------- simulation (merged from SOLARIS 5.0)
# World Builder, Flame Laboratory (Levels 1-3), flight-run records, onboard coupling, scenarios: /api/v5/*.
# On Vercel these routes are served by the dedicated function api/sim.py (see vercel.json).
from .sim_mount import register as _register_simulation  # noqa: E402

# api/index.py sets SOLARIS_SKIP_SIMULATION=1: on Vercel /api/v5 is routed to api/sim.py, so the evidence
# function never imports numpy/scipy/cantera on a cold start.
SIMULATION_AVAILABLE = None if os.environ.get("SOLARIS_SKIP_SIMULATION") == "1" else _register_simulation(app)
