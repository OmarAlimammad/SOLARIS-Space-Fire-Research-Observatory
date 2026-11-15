"""SOLARIS 4.0 evidence-aware mission research and verified passive-tracer sandbox.

Not spacecraft fire-risk prediction, flame CFD, instrument calibration, nor an LLM.
All evidence locators refer to immutable local CSV bytes.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .foundation import dataset, registry, parse_cell

router = APIRouter(prefix='/api/v1/mission-shield', tags=['MissionShield'])

# These are *topic indexes*, not quantitative scientific equivalence assertions.
TOPICS = {
    'solid-materials': ('bass-table', 'bass-ii-table', 'saffire-i-table', 'saffire-ii-table', 'saffire-iii-table'),
    'droplets': ('flex-table', 'flex-2-table'),
    'gas-flames': ('acme-normal', 'acme-inverse', 'spice-table'),
    'smoke': ('same-table', 'same-r-table', 'spice-table'),
}
ENVIRONMENTS = {
    'orbital': 'Orbiting spacecraft: free fall reduces buoyancy; interior atmosphere is mission-specific.',
    'lunar': 'Lunar surface gravity differs from orbital free fall; microgravity evidence cannot certify lunar operation.',
    'martian': 'Martian surface gravity differs from orbital free fall; a pressurized habitat is not ambient Mars.',
}


class Scenario(BaseModel):
    environment: Literal['orbital', 'lunar', 'martian'] = 'orbital'
    topic: Literal['solid-materials', 'droplets', 'gas-flames', 'smoke'] = 'solid-materials'
    source_term: str = Field(default='', max_length=80)
    oxygen_percent: float | None = Field(default=None, ge=0, le=100)
    ventilation: Literal['on', 'off'] = 'on'


def _source(dataset_id):
    try:
        return dataset(dataset_id)
    except KeyError as exc:
        raise HTTPException(404, 'Unknown dataset identifier') from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(503, 'Dataset unavailable or invalid') from exc


def passport(dataset_id: str, source_row: int):
    meta, rows = _source(dataset_id)
    if not 1 <= source_row <= len(rows):
        raise HTTPException(404, 'No source record at this row locator')
    record = rows[source_row - 1]
    fields = []
    for schema in meta['fields']:
        text = record['values'][schema['key']]
        parsed = parse_cell(text, schema['unit'], require_suffix=schema['unit_status'] == 'source_cell')
        fields.append({
            'field': schema['key'], 'raw_value': text, 'unit': schema['unit'],
            'unit_status': schema['unit_status'], 'value_kind': parsed['kind'],
            'scalar': parsed['number'] if schema['numeric_summary_allowed'] else None,
            'notes': schema['notes'],
        })
    return {
        'id': record['id'], 'investigation': meta['investigation'], 'dataset_id': meta['id'],
        'original_file': 'data/raw/' + meta['file'], 'sha256': meta['sha256'],
        'source_row': source_row, 'physical_csv_lines': [record['source_line_start'], record['source_line_end']],
        'role': record['role'], 'source_url': meta['source_url'],
        'transformations': ['Lossless CSV decode', 'Non-destructive scalar eligibility check'],
        'fields': fields,
        'limitations': [meta['row_semantics'], meta['provenance_status'],
                        'No experimental measurements or scientific equivalence inferred from metadata alone.'],
        'evidence_status': 'source_reported',
    }


@router.get('/passport/{dataset_id}/{source_row}')
def get_passport(dataset_id: str, source_row: int):
    return passport(dataset_id, source_row)


@router.post('/scenario')
def evaluate_scenario(scenario: Scenario):
    term = scenario.source_term.strip().casefold()
    candidates, total, matches = [], 0, 0
    for dataset_id in TOPICS[scenario.topic]:
        meta, rows = _source(dataset_id)
        eligible = [r for r in rows if r['role'] == 'source_record']
        total += len(eligible)
        filtered = [r for r in eligible if any(term in (v or '').casefold() for v in r['values'].values())] if term else eligible
        matches += len(filtered)
        previews = filtered[:3]
        candidates.append({
            'dataset_id': meta['id'], 'investigation': meta['investigation'],
            'source_rows': len(rows), 'candidate_rows': len(filtered),
            'sample_evidence': [{'record_id': r['id'], 'source_row': r['source_row'],
                                 'source_url': meta['source_url'], 'sha256': meta['sha256']} for r in previews],
            'disclaimer': 'Catalog association only; not experimental compatibility or outcome prediction.',
        })
    limits = [
        'Source-table row counts are not counts of independent experiments.',
        'No calibrated flame spread, ignition, toxicity, smoke detector response or fire-risk prediction is produced.',
        'Topic association does not establish material, geometry, pressure, gas composition or ventilation equivalence.',
        'Ventilation choice is a scenario description; raw fan-display columns cannot establish airspeed.',
    ]
    if scenario.environment != 'orbital':
        limits.append(f'Local microgravity tables do not validate transfer to a {scenario.environment} surface-gravity habitat.')
    if scenario.oxygen_percent is not None:
        limits.append('Requested oxygen fraction is NOT automatically matched to experimental fields with ambiguous units or definitions.')
    if term and not matches:
        limits.append('No source rows contained the literal search text. This does not establish absence in NASA research.')
    return {
        'method': 'Topic-indexed local evidence retrieval, version 1',
        'status': 'insufficient_evidence_for_safety_prediction',
        'environment': scenario.environment, 'environment_note': ENVIRONMENTS[scenario.environment],
        'source_term': scenario.source_term, 'oxygen_percent_requested': scenario.oxygen_percent,
        'ventilation_requested': scenario.ventilation, 'candidate_source_rows_total': total,
        'matching_source_rows_total': matches, 'datasets': candidates,
        'interpretation': 'Related local source records identified. No numerical hazard or safe/unsafe conclusion can be inferred.',
        'limitations': limits,
    }


@router.get('/coverage/{dataset_id}')
def coverage(dataset_id: str):
    meta, records = _source(dataset_id)
    # Explainable metadata coverage analysis, not publication-wide knowledge gaps.
    eligible = [r for r in records if r['role'] == 'source_record']
    rows = []
    for schema in meta['fields']:
        if schema['identifier'] or schema['instrument_display'] or not schema['numeric_summary_allowed']:
            continue
        present = sum(parse_cell(r['values'][schema['key']], schema['unit'],
                                 require_suffix=schema['unit_status'] == 'source_cell')['kind'] == 'scalar'
                      for r in eligible)
        rows.append({'field': schema['key'], 'unit': schema['unit'],
                     'source_record_rows': len(eligible), 'scalar_rows': present,
                     'not_scalar_rows': len(eligible) - present,
                     'status': 'catalogue_coverage_only'})
    rows.sort(key=lambda v: (-v['not_scalar_rows'], v['field'].casefold()))
    return {
        'dataset_id': dataset_id, 'sha256': meta['sha256'], 'row_count': len(records),
        'source_record_rows': len(eligible), 'fields': rows,
        'next_experiment_candidates': [
            {'field': f['field'], 'reason': f"{f['not_scalar_rows']} of {f['source_record_rows']} source-record rows lack an eligible finite scalar; determine whether targeted measurement or documentation could resolve it.",
             'proposal_status': 'research_question_not_an_approved_experiment'}
            for f in rows if f['not_scalar_rows'] and f['source_record_rows']
        ][:5],
        'limitations': [
            'These are gaps in local table scalar coverage, not proven gaps in NASA experiments or science.',
            'No physical feasibility, material safety or expected information gain has been established.',
        ],
    }


class CompareRequest(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=60)
    first_row: int = Field(ge=1)
    second_row: int = Field(ge=1)


@router.post('/compare')
def compare_source_records(request: CompareRequest):
    if request.first_row == request.second_row:
        raise HTTPException(422, 'Choose two different source-row locators')
    meta, rows = _source(request.dataset_id)
    if max(request.first_row, request.second_row) > len(rows):
        raise HTTPException(404, 'Source row not found')
    a, b = rows[request.first_row-1], rows[request.second_row-1]
    fields = []
    for schema in meta['fields']:
        av, bv = a['values'][schema['key']], b['values'][schema['key']]
        fields.append({'field': schema['key'], 'first': av, 'second': bv,
                       'relationship': 'same_source_text' if av == bv else 'different_source_text',
                       'unit': schema['unit']})
    return {
        'dataset_id': meta['id'], 'sha256': meta['sha256'],
        'first': a['id'], 'second': b['id'],
        'fields': fields, 'classification': 'different_conditions_or_insufficient_evidence',
        'explanation': 'Field comparison is literal source-text comparison, not an automated scientific contradiction finding.',
        'passports': [f'/api/v1/mission-shield/passport/{meta["id"]}/{i}' for i in (request.first_row, request.second_row)],
    }


def tracer_transport(ventilation='on', steps=80, diffusion=0.16, width=32, height=22):
    """Mass-conservative explicit upwind advection+diffusion on a 2D periodic domain.

    Passive tracer, prescribed divergence-free shear u(y), dimensionless reference units;
    NOT reactive flow, a solved velocity field or a spacecraft CFD validation.
    """
    dt = 0.05
    dx = 1.0
    max_u = 0.8 if ventilation == 'on' else 0.0
    cfl = dt * (max_u / dx + 4.0 * diffusion / (dx * dx))
    if cfl > 1:
        raise ValueError('Explicit transport stability condition violated')
    grid = [[math.exp(-((x-8.0)**2 + (y-height/2)**2)/9.0)
             for x in range(width)] for y in range(height)]
    initial_mass = sum(map(sum, grid))
    for _ in range(steps):
        following = [[0.0] * width for _ in range(height)]
        for y in range(height):
            u = max_u * math.sin(2 * math.pi * y / height)
            for x in range(width):
                current = grid[y][x]
                xp, xm = grid[y][(x+1)%width], grid[y][(x-1)%width]
                yp, ym = grid[(y+1)%height][x], grid[(y-1)%height][x]
                adv = -u * dt / dx * (current-xm if u >= 0 else xp-current)
                diffuse = diffusion*dt/(dx*dx)*(xp+xm+yp+ym-4*current)
                following[y][x] = current + adv + diffuse
        grid = following
    final_mass = sum(map(sum, grid))
    return {'grid': [[round(c, 6) for c in row] for row in grid],
            'initial_mass': initial_mass, 'final_mass': final_mass,
            'relative_mass_error': abs(final_mass-initial_mass)/initial_mass,
            'min_value': min(min(row) for row in grid), 'max_value': max(max(row) for row in grid),
            'cfl_ratio': cfl, 'duration_reference_units': steps * dt,
            'model': 'Passive scalar: periodic 2D explicit upwind advection–diffusion with prescribed shear flow',
            'status': 'numerically_testable_conceptual_transport',
            'units': 'dimensionless normalized tracer; arbitrary reference length/time',
            'assumptions': [
                'Periodic boundaries in x and y; NOT a real habitat floorplan.',
                'Prescribed divergence-free shear flow; no Navier–Stokes momentum solve.',
                'No reaction, buoyancy, deposition, sensors, ventilation ducts or combustion chemistry.',
                'Ventilation on/off changes prescribed shear speed, not measured airflow.',
            ]}


@router.get('/transport')
def transport(ventilation: Literal['on', 'off'] = 'on', steps: int = Query(80, ge=1, le=240)):
    return tracer_transport(ventilation=ventilation, steps=steps)


@router.get('/overview')
def overview():
    snapshot = registry()
    return {'mission': 'Connect local NASA investigation tables to explainable safety research questions',
            'investigations': snapshot['investigation_count'], 'datasets': snapshot['dataset_count'],
            'source_rows_not_independent_experiments': snapshot['total_source_rows'],
            'topics': [{'id': key, 'dataset_ids': ids} for key, ids in TOPICS.items()],
            'scientific_status': 'evidence exploration only; not an operational fire-safety predictor'}


class NumericClaim(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=60)
    field: str = Field(min_length=1, max_length=220)
    statistic: Literal['min', 'max', 'median'] = 'max'
    relation: Literal['gte', 'lte'] = 'gte'
    proposed_value: float = Field(allow_inf_nan=False)


@router.post('/referee/number')
def referee_numeric_claim(request: NumericClaim):
    """Deterministic check of one descriptive claim; not open-ended fact checking."""
    meta, records = _source(request.dataset_id)
    schema = next((f for f in meta['fields'] if f['key'] == request.field), None)
    if schema is None:
        raise HTTPException(422, 'Unknown source field')
    if not schema['numeric_summary_allowed']:
        raise HTTPException(422, 'This field has no approved numeric interpretation')
    included = []
    eligible = [r for r in records if r['role'] == 'source_record']
    for r in eligible:
        result = parse_cell(r['values'][request.field], schema['unit'],
                            require_suffix=schema['unit_status'] == 'source_cell')
        if result['kind'] == 'scalar':
            included.append((result['number'], r['id']))
    if not included:
        return {'status': 'insufficient_evidence', 'reason': 'No eligible finite scalar values',
                'dataset_id': request.dataset_id, 'field': request.field,
                'source_sha256': meta['sha256']}
    included.sort(key=lambda t: t[0])
    n = len(included)
    numbers = [v for v, _ in included]
    values = {'min': numbers[0], 'max': numbers[-1],
              'median': numbers[(n-1)//2] / 2 + numbers[n//2] / 2}
    observed = values[request.statistic]
    comparison = observed >= request.proposed_value if request.relation == 'gte' else observed <= request.proposed_value
    return {'status': 'supported_by_eligible_source_scalars' if comparison else 'not_supported_by_eligible_source_scalars',
            'method': 'Deterministic finite scalar extraction and descriptive comparison',
            'dataset_id': request.dataset_id, 'field': request.field, 'unit': schema['unit'],
            'source_sha256': meta['sha256'], 'statistic': request.statistic, 'relation': request.relation,
            'claimed_value': request.proposed_value, 'observed_value': observed,
            'included_scalar_rows': n, 'excluded_source_record_rows': len(eligible)-n,
            'example_locators': [loc for _, loc in included[:3]],
            'limitations': [
                'The check covers recorded eligible scalars in this local CSV, not the underlying NASA population.',
                'It does not establish causal, predictive or spacecraft safety conclusions.',
                'The comparison is descriptive and not a generative AI inference.',
            ]}
