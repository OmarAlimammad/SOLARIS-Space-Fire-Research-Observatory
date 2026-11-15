"""Simulation Passport: provenance, model, numerics, applicability and validation status of one run."""
from __future__ import annotations

import json
from pathlib import Path

BENCH_FILE = Path(__file__).resolve().parents[2] / 'docs' / 'v5' / 'benchmark_report.json'

KIND_INFO = {
    'equilibrium': (1, 'Chemical equilibrium (Cantera, Gibbs minimisation)', ['L1-EQ-CH4', 'L1-ELEMENTS']),
    'reactor': (1, 'Homogeneous reactor with detailed kinetics (Cantera ReactorNet, CVODES)', ['L1-REACTOR-CONS']),
    'premixed_flame': (2, '1-D freely propagating premixed flame (Cantera FreeFlame)', ['L2-SL-CH4', 'L2-SL-H2']),
    'counterflow_flame': (2, '1-D counterflow diffusion flame (Cantera CounterflowDiffusionFlame)', ['L2-CF-CH4']),
    'flame_l3': (3, 'Transient 2-D low-Mach reacting flow (SOLARIS lowmach kernel)', ['L3-VOLUME-BALANCE', 'L3-CAVITY-GHIA', 'L3-DIFFUSION', 'L3-SEALED-ADIABATIC', 'L3-BUOYANCY', 'L3-GRID']),
    'coupled_flame': (3, 'One-way coupled flight -> chamber transient 2-D reacting flow', ['L3-VOLUME-BALANCE', 'L3-CAVITY-GHIA', 'L3-SEALED-ADIABATIC', 'CPL-SIGN']),
    'flight': ('flight', 'Translational flight dynamics (SOLARIS flight engine, browser-executed)', ['FL-KEPLER', 'FL-ROCKET-EQ', 'FL-EPHEM-INTERP']),
    'saturn_legacy': ('flight', 'Legacy Saturn V 3-DOF ascent (original physics.mjs)', ['FL-SATURN-BASELINE']),
}


FLIGHT_BENCH_FILE = BENCH_FILE.with_name('flight_benchmark_report.json')


def benchmark_table() -> dict:
    """Combustion/environment benchmarks plus the flight benchmarks (stored separately by the Node test suite)."""
    try:
        table = json.loads(BENCH_FILE.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        table = {'benchmarks': {}}
    try:
        flight = json.loads(FLIGHT_BENCH_FILE.read_text(encoding='utf-8'))
        table.setdefault('benchmarks', {}).update({b['id']: {**b, 'suite': 'flight'} for b in flight.get('benchmarks', [])})
        table['flight_generated_utc'] = flight.get('generated_utc')
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        pass
    return table


def build_passport(manifest: dict, status: dict, result: dict | None) -> dict:
    kind = manifest['kind']
    level, model, bench_ids = KIND_INFO.get(kind, (None, kind, []))
    bt = benchmark_table().get('benchmarks', {})
    benches = [{'id': b, **({k: bt[b].get(k) for k in ('title', 'status', 'metric', 'value', 'tolerance', 'reference')} if b in bt else {'status': 'not run in this installation'})} for b in bench_ids]
    r = result or {}
    numerics = {}
    if kind in ('flame_l3', 'coupled_flame') and r:
        numerics = {'grid': {k: r['grid'][k] for k in ('nx', 'ny', 'dx_m', 'dy_m', 'geometry')}, 'steps': r.get('steps'), 'time_reached_s': r.get('time_reached_s'),
                    'scheme': 'staggered MAC, van Leer advection, central diffusion, explicit Euler, sub-cycled chemistry, direct sparse projection',
                    'max_cfl': max((s.get('cfl') or 0) for s in r.get('series', [{}])), 'max_mach': max((s.get('mach') or 0) for s in r.get('series', [{}])),
                    'max_divergence_residual_1_s': max((s.get('div_residual_1_s') or 0) for s in r.get('series', [{}])), 'budgets': r.get('budgets')}
    elif r:
        numerics = {'checks': r.get('checks'), 'numerics': r.get('numerics')}
    validation = {
        1: 'Verified against conservation laws and reference values (see benchmarks). Cantera and GRI-Mech 3.0 are independently validated by their authors within the stated range; this run itself is not an experiment.',
        2: 'Verified numerically (grid refinement, conservation); compared with textbook laminar flame data in the benchmark suite. Not validated for conditions outside the mechanism range.',
        3: 'Solver verified on analytic and published numerical benchmarks (see below). The reacting configuration is NOT validated against experiment: one-step chemistry and missing soot/radiation limit it to qualitative-to-semi-quantitative trends.',
        'flight': 'Verified against two-body analytic solutions, the rocket equation and JPL Horizons states (see benchmarks). Not a certified mission-design tool.',
    }.get(level, 'Not assessed.')
    return {
        'run_id': manifest['run_id'], 'experiment_id': manifest.get('experiment_id'), 'kind': kind, 'label': manifest.get('label'),
        'status': status.get('status'), 'status_reason': status.get('reason'),
        'fidelity_level': level, 'model': r.get('model') or model,
        'origin': 'SIMULATION-DERIVED (computed by this software from the listed inputs). Not a NASA measurement.',
        'created_utc': manifest['created_utc'], 'wall_time_s': status.get('wall_time_s'),
        'software': manifest.get('versions'), 'schema_version': manifest.get('schema_version'),
        'input_sha256': manifest.get('input_sha256'), 'mechanism_file_sha256': manifest.get('mechanism_file_sha256'),
        'mechanism': r.get('mechanism'), 'chemistry': r.get('chemistry'),
        'assumptions': r.get('assumptions') or manifest.get('assumptions') or [],
        'applicability': r.get('applicability') or (r['mechanism'].get('optimized_range') if isinstance(r.get('mechanism'), dict) else None),
        'limitations': r.get('limitations') or [],
        'numerical_diagnostics': numerics, 'validation_status': validation, 'benchmarks': benches,
        'benchmark_report_generated_utc': benchmark_table().get('generated_utc'),
        'evidence_lineage': manifest.get('lineage') or [],
        'inputs': manifest.get('spec') if kind not in ('coupled_flame', 'flight', 'saturn_legacy') else {k: v for k, v in manifest.get('spec', {}).items() if k not in ('flight', 'telemetry')},
    }
