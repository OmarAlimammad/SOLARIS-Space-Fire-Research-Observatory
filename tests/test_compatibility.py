"""Scientific source-grounding and endpoint regression tests.

Run from project root: python -m pytest -q tests
Requires: fastapi, pytest, httpx
"""
from fastapi.testclient import TestClient
from backend.main import app, load_original_records
from backend.scientific.compatibility import build_comparison

client = TestClient(app)


def test_initial_oxygen_and_explicit_thickness_b1_b2():
    response = client.post('/api/compatibility', json={'first_id': 'B1', 'second_id': 'B2'})
    assert response.status_code == 200
    data = response.json()
    by_key = {field['key']: field for field in data['fields']}
    assert data['assessment'] == 'source_review_required'
    assert by_key['fuel_family']['status'] == 'match'
    assert by_key['thickness_um']['first_value'] == 100.0
    assert by_key['thickness_um']['second_value'] == 200.0
    assert by_key['thickness_um']['status'] == 'different'
    assert by_key['initial_oxygen_pct']['first_value'] == 22.2
    assert by_key['initial_oxygen_pct']['status'] == 'match'
    assert data['evidence_passport']['record_ids'] == ['B1', 'B2']


def test_raw_readout_is_never_converted_into_cm_per_s():
    result = client.post('/api/compatibility', json={'first_id': 'B1', 'second_id': 'B2'}).json()
    fields = {field['key']: field for field in result['fields']}
    assert fields['air_display']['first_value'] == '5'
    assert fields['air_display']['status'] == 'match'
    assert 'DOES NOT establish equal airflow speed' in fields['air_display']['interpretation']
    assert any('No flame-spread-rate' in warning for warning in result['evidence_passport']['limitations'])
    assert 'score' not in result


def test_missing_field_remains_unknown():
    a = {'id': 'demoA', 'fuel': '100 micron PMMA film', 'initial_oxygen_pct': None, 'air_display': '', 'fan_display': '', 'flow_restrictor': '', 'source_url': 'source', 'source_locator': 'A', 'final_oxygen_pct': None}
    b = {**a, 'id': 'demoB', 'source_locator': 'B', 'initial_oxygen_pct': 22.2}
    result = build_comparison(a, b)
    fields = {f['key']: f for f in result['fields']}
    assert fields['initial_oxygen_pct']['status'] == 'unknown'
    assert fields['air_display']['status'] == 'unknown'
    assert result['comparison']['unknown'] >= 1


def test_invalid_and_missing_selections_rejected():
    assert client.post('/api/compatibility', json={'first_id': 'B1', 'second_id': 'B1'}).status_code == 422
    assert client.post('/api/compatibility', json={'first_id': 'B1', 'second_id': 'NOT_REAL'}).status_code == 404
    assert client.post('/api/compatibility', json={'first_id': '', 'second_id': 'B2'}).status_code == 422


def test_no_data_mutation():
    before = load_original_records()[0].copy()
    client.post('/api/compatibility', json={'first_id': 'B1', 'second_id': 'B2'})
    after = load_original_records()[0]
    assert after == before
