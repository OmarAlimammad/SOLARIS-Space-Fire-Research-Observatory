"""MissionShield science boundaries, API contract and passive scalar numeric checks."""
import hashlib
import math
from pathlib import Path

import pytest

from tests.asgi_client import ASGIClient
from backend.main import app
from backend.scientific.mission_shield import tracer_transport
from backend.scientific.foundation import dataset, registry

client = ASGIClient(app)
BASE = '/api/v1/mission-shield'
ROOT = Path(__file__).resolve().parents[1]


def test_catalogue_and_source_hashes():
    reg = registry()
    assert reg['investigation_count'] == 11
    assert reg['dataset_count'] == reg['available_count'] == 12
    assert reg['total_source_rows'] == 1467
    for item in reg['items']:
        raw = (ROOT / 'data/raw' / item['file']).read_bytes()
        assert item['sha256'] == hashlib.sha256(raw).hexdigest()


def test_scenario_is_source_grounded_and_refuses_risk_inference():
    response = client.post(BASE + '/scenario', json={
        'environment': 'lunar', 'topic': 'solid-materials', 'source_term': 'PMMA',
        'oxygen_percent': 21.0, 'ventilation': 'on'})
    assert response.status_code == 200
    data = response.json()
    assert data['matching_source_rows_total'] > 0
    assert data['status'] == 'insufficient_evidence_for_safety_prediction'
    assert any('lunar' in x.casefold() for x in data['limitations'])
    assert len(data['datasets']) == 5
    for record in data['datasets']:
        meta, _ = dataset(record['dataset_id'])
        assert record['investigation'] == meta['investigation']
        for cited in record['sample_evidence']:
            assert cited['sha256'] == meta['sha256']


def test_scenario_handles_zero_hits_and_validation():
    result = client.post(BASE+'/scenario', json={'topic':'smoke', 'source_term':'IMPOSSIBLE-ABSENT-VALUE-987654'})
    assert result.status_code == 200
    assert result.json()['matching_source_rows_total'] == 0
    assert client.post(BASE+'/scenario', json={'oxygen_percent': 101}).status_code == 422
    assert client.post(BASE+'/scenario', json={'environment': 'space-outside'}).status_code == 422


def test_passport_exact_source_fields_and_sha256():
    result = client.get(BASE+'/passport/bass-ii-table/1')
    assert result.status_code == 200
    data = result.json()
    meta, records = dataset('bass-ii-table')
    assert data['sha256'] == meta['sha256']
    assert data['id'] == records[0]['id']
    assert len(data['fields']) == len(meta['columns'])
    assert {f['field']: f['raw_value'] for f in data['fields']} == records[0]['values']
    assert client.get(BASE+'/passport/bass-ii-table/99999').status_code == 404
    assert client.get(BASE+'/passport/no-such-file/1').status_code == 404


def test_coverage_never_claims_approved_experiments():
    result=client.get(BASE+'/coverage/bass-ii-table')
    assert result.status_code == 200
    data=result.json()
    assert data['source_record_rows'] == 129
    assert all(item['scalar_rows']+item['not_scalar_rows']==129 for item in data['fields'])
    assert all(item['proposal_status']=='research_question_not_an_approved_experiment' for item in data['next_experiment_candidates'])


def test_literal_comparison_and_invalid_rows():
    result=client.post(BASE+'/compare',json={'dataset_id':'bass-ii-table','first_row':1,'second_row':2})
    assert result.status_code == 200
    fields=result.json()['fields']
    assert fields
    assert all(field['relationship'] in ('same_source_text','different_source_text') for field in fields)
    assert client.post(BASE+'/compare',json={'dataset_id':'bass-ii-table','first_row':1,'second_row':1}).status_code == 422
    assert client.post(BASE+'/compare',json={'dataset_id':'bass-ii-table','first_row':1,'second_row':10000}).status_code == 404


@pytest.mark.parametrize('vent,steps', [('off',20),('on',20),('on',100),('on',240)])
def test_passive_tracer_conserves_mass_and_nonnegative(vent,steps):
    answer=tracer_transport(ventilation=vent,steps=steps)
    assert len(answer['grid']) == 22 and len(answer['grid'][0]) == 32
    assert answer['relative_mass_error'] < 1e-12
    assert answer['min_value'] >= 0
    assert answer['cfl_ratio'] < 1
    assert answer['status'] == 'numerically_testable_conceptual_transport'


def test_passive_transport_changes_with_shear_not_fake_measured_data():
    a=tracer_transport(ventilation='on',steps=90)
    b=tracer_transport(ventilation='off',steps=90)
    assert a['grid'] != b['grid']
    assert a['initial_mass'] == b['initial_mass']
    assert 'dimensionless' in a['units']


def test_transport_api_range_checks():
    assert client.get(BASE+'/transport?steps=80&ventilation=on').status_code == 200
    assert client.get(BASE+'/transport?steps=500').status_code == 422
    assert client.get(BASE+'/transport?ventilation=unknown').status_code == 422


def test_numeric_referee_supported_and_refuted_claims():
    meta, _ = dataset('bass-ii-table')
    numeric = next(f for f in meta['fields'] if f['numeric_summary_allowed'])
    requested = {'dataset_id': 'bass-ii-table', 'field': numeric['key'],
                 'statistic': 'max', 'relation': 'gte', 'proposed_value': -1000}
    good = client.post(BASE + '/referee/number', json=requested)
    assert good.status_code == 200
    assert good.json()['status'] == 'supported_by_eligible_source_scalars'
    requested['proposed_value'] = 100000000
    bad = client.post(BASE + '/referee/number', json=requested)
    assert bad.status_code == 200
    assert bad.json()['status'] == 'not_supported_by_eligible_source_scalars'
    requested['field'] = 'not-real'
    assert client.post(BASE + '/referee/number', json=requested).status_code == 422
    requested['field'] = numeric['key']
    requested['proposed_value'] = 'NaN'
    assert client.post(BASE + '/referee/number', json=requested).status_code == 422
