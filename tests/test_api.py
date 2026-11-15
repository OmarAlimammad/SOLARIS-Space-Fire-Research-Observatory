"""Optional API smoke tests: pip install pytest httpx"""
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_original_source_row_count():
    response = client.get('/api/metadata')
    assert response.status_code == 200
    assert response.json()['total_records'] == 129


def test_experiment_linked_to_nasa_source():
    response = client.get('/api/experiments/B1')
    assert response.status_code == 200
    body = response.json()
    assert body['initial_oxygen_pct'] == 22.2
    assert body['air_display'] == '5'
    assert body['source_url'].startswith('https://psi.nasa.gov/')


def test_search_and_missing_record():
    response = client.get('/api/experiments?search=PMMA&limit=10')
    assert response.status_code == 200
    assert len(response.json()['items']) <= 10
    assert client.get('/api/experiments/does-not-exist').status_code == 404
