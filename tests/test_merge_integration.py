"""Tests for the SOLARIS 5.0 → live-site merge: provenance checks, AI retrieval over the new tables,
catalog status, hosted (inline) simulation execution and the engine-unavailable fallback."""
import hashlib
import importlib
import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ["SOLARIS_COPILOT_DISABLE_LLM"] = "1"
from backend.main import app  # noqa: E402
from backend.services import copilot, search  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
client = TestClient(app)


def test_every_source_table_matches_the_psi_listing_and_manifest():
    reg = client.get("/api/v1/datasets").json()
    assert reg["dataset_count"] == 12 and reg["total_source_rows"] == 1467
    manifest = {}
    for line in (ROOT / "data" / "SOURCE_FILE_SHA256_MANIFEST.txt").read_text().splitlines():
        if line and not line.startswith("#"):
            digest, path = line.split("  ", 1)
            manifest[path] = digest
    for d in reg["items"]:
        assert d["psi_listing"]["status"] == "name_and_size_match", d["id"]
        assert d["source_url"].startswith("https://psi.nasa.gov/physci/repo/data/investigations/PSI-")
        raw = (ROOT / "data" / "raw" / d["file"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == d["sha256"] == manifest[f"data/raw/{d['file']}"]


def test_search_and_copilot_use_source_table_rows_with_locators_but_cap_them():
    rows = [p for p in search.corpus() if p["evidence_type"] == "source_table_row"]
    assert len(rows) > 1000 and all(p["dataset_id"] and p["source_row"] >= 1 for p in rows)
    assert not any(p["dataset_id"] == "bass-ii-table" for p in rows)  # BASS-II rows keep their own passages
    ans = copilot.answer("What does the SPICE table record about smoke points?")
    table_rows = [p for p in ans["passages"] if p["evidence_type"] == "source_table_row"]
    assert 1 <= len(table_rows) <= copilot.MAX_TABLE_ROWS
    assert all("experimental table" in p["citation"] and "SHA-256" in p["citation"] for p in table_rows)
    assert any("never pooled" in line for line in ans["integrity"])


def test_catalog_status_reflects_imported_tables_and_partial_acme():
    items = {i["id"]: i for i in client.get("/api/investigations").json()["items"]}
    assert items["acme"]["data_status"]["label"] == "2 of 6 PSI-listed tables imported"
    assert items["flex"]["data_status"]["imported_rows"] == 274
    gaps = client.get("/api/research/gaps").json()
    assert all(a["level"] == "row_level_imported" for a in gaps["investigation_availability"])


def test_mission_shield_tools_answer_for_non_bassii_tables():
    cov = client.get("/api/v1/mission-shield/coverage/spice-table").json()
    assert cov["source_record_rows"] > 0 and cov["fields"]
    pp = client.get("/api/v1/mission-shield/passport/flex-table/5").json()
    assert pp["source_url"].endswith("PSI-69") and pp["physical_csv_lines"][0] >= 2


def test_simulation_routes_answer_503_with_guidance_when_engine_is_missing(monkeypatch):
    import builtins
    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if (globals or {}).get("__name__") == "backend.sim_mount" and name.startswith("sim"):
            raise ImportError("No module named 'cantera'")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    from backend import sim_mount
    bare = FastAPI()
    assert sim_mount.register(bare) is False
    r = TestClient(bare).get("/api/v5/capabilities")
    assert r.status_code == 503 and r.json()["error"]["code"] == "simulation_unavailable"
    assert "requirements" in r.json()["error"]["recovery"]


try:
    import cantera  # noqa: F401
    ENGINE = True
except ImportError:
    ENGINE = False


@pytest.mark.skipif(not ENGINE, reason="simulation engine (cantera) not installed")
def test_inline_mode_returns_complete_record_and_stateless_export(monkeypatch, tmp_path):
    from backend.sim import jobs
    monkeypatch.setattr(jobs, "EXECUTION", "inline")
    monkeypatch.setattr(jobs, "ROOT", tmp_path)
    air = {"basis": "mole", "species": {"N2": 0.79, "O2": 0.21}}
    r = client.post("/api/v5/runs", json={"kind": "equilibrium", "spec": {"fuel": {"basis": "mole", "species": {"CH4": 1}}, "oxidizer": air}})
    body = r.json()
    assert r.status_code == 200 and body["execution"] == "inline" and body["status"] == "completed"
    b = body["bundle"]
    assert abs(b["result"]["final"]["temperature_k"] - 2226) < 15  # L1-EQ-CH4 benchmark
    assert b["passport"]["origin"].startswith("SIMULATION-DERIVED")
    assert client.get("/api/v5/capabilities").json()["execution"]["mode"] == "inline"
    assert client.get("/api/v5/runs").json()["runs"] == []
    z = client.post("/api/v5/runs/export?format=zip", json={k: b[k] for k in ("manifest", "status", "result")})
    assert z.status_code == 200 and z.content[:2] == b"PK"
    md = client.post("/api/v5/runs/export?format=md", json={k: b[k] for k in ("manifest", "status", "result")})
    assert md.status_code == 200 and "Input SHA-256" in md.text
    assert client.post("/api/v5/scenarios", json={"title": "x", "destination": "world", "payload": {}}).json()["error"]["code"] == "not_persistent"


@pytest.mark.skipif(not ENGINE, reason="simulation engine (cantera) not installed")
def test_inline_budget_stops_long_runs_without_reporting_partial_results(monkeypatch, tmp_path):
    from backend.sim import jobs
    monkeypatch.setattr(jobs, "EXECUTION", "inline")
    monkeypatch.setattr(jobs, "ROOT", tmp_path)
    monkeypatch.setattr(jobs, "INLINE_BUDGET_S", 1.0)
    air = {"basis": "mole", "species": {"N2": 0.79, "O2": 0.21}}
    spec = dict(geometry="axisymmetric", length_m=0.08, width_m=0.04, boundary="open",
                burner=dict(radius_m=0.003, fuel={"basis": "mole", "species": {"CH4": 1}}, fuel_temperature_k=300, fuel_velocity_m_s=0.25),
                coflow=dict(velocity_m_s=0), ambient=dict(composition=air, pressure_pa=101325, temperature_k=300),
                acceleration_axial_m_s2=-9.80665, ignition=dict(enabled=True), reaction_enabled=True, radiation=dict(model="none"),
                numerics=dict(nx=80, ny=40, duration_s=0.4, output_interval_s=0.01))
    body = client.post("/api/v5/runs", json={"kind": "flame_l3", "spec": spec}).json()
    assert body["status"] == "timed_out" and body["bundle"]["frames"] is None
    assert "budget" in body["bundle"]["status"]["reason"]


@pytest.mark.skipif(not ENGINE, reason="simulation engine (cantera) not installed")
def test_flight_passports_cite_the_flight_benchmarks():
    from backend.sim.passport import benchmark_table, build_passport
    assert {"FL-KEPLER", "FL-ROCKET-EQ", "FL-EPHEM-INTERP"} <= set(benchmark_table()["benchmarks"])
    pp = build_passport({"run_id": "x", "kind": "flight", "created_utc": "2026-01-01"}, {"status": "completed"}, {})
    assert all(b["status"] == "PASS" for b in pp["benchmarks"])
