"""Integrity tests for the SOLARIS v2 research API.

Run from project root: python -m pytest -q tests
"""
import os

from fastapi.testclient import TestClient

from backend.main import app
from backend.services import catalog, graph, search

os.environ["SOLARIS_COPILOT_DISABLE_LLM"] = "1"
client = TestClient(app)


def test_eleven_investigations_and_only_bassii_has_rows():
    items = client.get("/api/investigations").json()["items"]
    assert [i["name"] for i in items] == ["BASS", "BASS-II", "ACME", "FLEX", "FLEX-2", "Saffire-I", "Saffire-II", "Saffire-III", "SAME", "SAME-R", "SPICE"]
    imported = [i["id"] for i in items if i["data_status"]["level"] == "row_level_imported"]
    assert imported == ["bass-ii"]
    assert next(i for i in items if i["id"] == "bass-ii")["data_status"]["imported_rows"] == 129
    for i in items:
        assert i["psi_url"].startswith("https://psi.nasa.gov/physci/repo/data/investigations/PSI-")


def test_verified_psi_accessions():
    by = {i["id"]: i["accessions"] for i in client.get("/api/investigations").json()["items"]}
    assert by["bass-ii"] == ["PSI-25"] and by["bass"] == ["PSI-26"] and by["flex"] == ["PSI-69"]
    assert by["saffire-i"] == ["PSI-98"] and by["same-r"] == ["PSI-101"] and by["same"] == ["PSI-102"] and by["spice"] == ["PSI-107"]


def test_findings_have_sources_and_locators():
    for f in client.get("/api/findings").json()["items"]:
        assert f["quote"] and f["locator"] and f["source"]["url"].startswith("https://")
        assert f["evidence_type"] == "published_finding"


def test_timeline_events_all_have_sources_and_bassii_dates_come_from_table():
    data = client.get("/api/timeline").json()
    assert all(e["source"]["url"].startswith("https://") for e in data["events"])
    data_events = [e for e in data["events"] if e["kind"] == "data"]
    assert sum(len(e["record_ids"]) for e in data_events) == 129
    assert {e["date"][:4] for e in data_events} == {"2014", "2016", "2018"}


def test_graph_edges_reference_nodes_and_declare_basis():
    g = graph.build_graph()
    ids = {n["id"] for n in g["nodes"]}
    kinds = set(g["legend"])
    for e in g["edges"]:
        assert e["source"] in ids and e["target"] in ids
        assert e["basis"] and e["basis_kind"] in kinds


def test_search_returns_labelled_evidence():
    res = client.get("/api/search", params={"q": "PMMA extinction oxygen"}).json()["results"]
    assert res and all("evidence_type" in r and "citation" in r for r in res)
    assert res[0]["evidence_type"] == "published_finding"


def test_copilot_retrieval_mode_never_fabricates_answer_text():
    body = client.post("/api/copilot", json={"question": "How do B1 and B2 differ?"}).json()
    assert body["mode"] == "retrieval" and body["answer"] is None
    assert body["intent"]["comparison"]["evidence_passport"]["record_ids"] == ["B1", "B2"]
    pm = client.post("/api/copilot", json={"question": "Which experiments involve PMMA?"}).json()
    assert pm["intent"]["material"]["count"] > 0


def test_gaps_counts_match_table_and_no_scores():
    g = client.get("/api/research/gaps").json()
    assert sum(m["count"] for m in g["material_groups"]) == 129
    assert sum(c["count"] for c in g["cells"]) + sum(m["unknown_o2"] for m in g["material_groups"]) == 129
    assert "score" not in str(g.keys())


def test_tensions_do_not_invent_contradictions():
    t = client.get("/api/research/tensions", params={"concept": "flame-spread"}).json()
    assert t["verdict"] in {"source_stated_discrepancy", "no_contradiction_detected", "insufficient_statements"}


def test_what_if_is_observational():
    r = client.get("/api/research/what-if", params={"base": "B1", "change": "oxygen", "value": "17"}).json()
    assert r["mode"] == "observational_lookup"
    for m in r["matches"]:
        assert abs(m["initial_oxygen_pct"] - 17) <= 1.0
    assert client.get("/api/research/what-if", params={"base": "B1", "change": "bogus"}).status_code == 422


def test_media_listing_is_names_only():
    m = client.get("/api/experiments/B1/media").json()
    assert m["files"] and all("file_name" in f for f in m["files"])
    assert not any("remote_url" in f or "s3_path" in f for f in m["files"])
    assert client.get("/api/experiments/NOPE/media").status_code == 404


def test_report_is_a_real_pdf():
    r = client.post("/api/report", json={"question": "B1 vs B2", "record_ids": ["B1", "B2"]})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-" and len(r.content) > 5000
    assert len(r.headers["x-solaris-csv-sha256"]) == 64


def test_schema_labels_instrument_fields_honestly():
    cols = {c["key"]: c for c in client.get("/api/datasets/bass-ii/schema").json()["columns"]}
    assert cols["air_display"]["evidence_class"] == "instrument_readout"
    assert cols["initial_oxygen_pct"]["evidence_class"] == "measured"


def test_catalog_snapshot_has_no_contact_emails():
    import json
    raw = json.dumps(catalog.psi_snapshot())
    assert "@nasa.gov" not in raw
    assert search.corpus()
