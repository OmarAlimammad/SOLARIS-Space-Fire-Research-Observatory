"""SOLARIS 5.0 REST API (/api/v5): environments, chemistry and reacting-flow jobs, runs, scenarios."""
from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from pathlib import Path
from typing import Any, Literal

import numpy as np
from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import Field, ValidationError

from . import SCHEMA_VERSION, SOFTWARE_VERSION, jobs
from .capabilities import capabilities
from .chemistry import CounterflowSpec, EquilibriumSpec, PremixedFlameSpec, ReactorSpec
from .coupling import CoupledSpec, prepare_coupled
from .environment import Composition, EnvironmentSpec, Strict, evaluate_environment, hydrostatic_profile, inspect_mixture, normalize_mixture, presets, registry
from .errors import SimError
from .lowmach import FlameL3Spec, Solver
from .passport import benchmark_table, build_passport

router = APIRouter(prefix='/api/v5', tags=['solaris-5'])
SCEN_DIR = Path(__file__).resolve().parents[2] / 'scenarios'
USER_SCEN_DIR = jobs.ROOT.parent / 'scenarios'
SPEC_MODELS = {'equilibrium': EquilibriumSpec, 'reactor': ReactorSpec, 'premixed_flame': PremixedFlameSpec,
               'counterflow_flame': CounterflowSpec, 'flame_l3': FlameL3Spec, 'coupled_flame': CoupledSpec}


def sim_error_response(e: SimError):
    return JSONResponse(status_code=e.status, content={'error': e.as_dict()})


def validation_response(e: ValidationError):
    errs = [{'code': 'schema', 'field': '.'.join(str(p) for p in x['loc']), 'message': x['msg'], 'expected': x.get('type'), 'recovery': None} for x in e.errors()[:20]]
    return JSONResponse(status_code=422, content={'error': errs[0], 'errors': errs})


def not_found(run_id):
    return JSONResponse(status_code=404, content={'error': {'code': 'not_found', 'message': f'Run {run_id!r} does not exist.', 'field': 'run_id', 'expected': None, 'recovery': 'List runs at /api/v5/runs.'}})


@router.get('/capabilities')
def get_capabilities():
    return {'software_version': SOFTWARE_VERSION, 'schema_version': SCHEMA_VERSION, **capabilities(), 'versions': jobs.versions(),
            'benchmarks': benchmark_table(), 'execution': execution_info()}


def execution_info() -> dict:
    inline = jobs.EXECUTION == 'inline'
    return {'mode': jobs.EXECUTION, 'budget_s': jobs.INLINE_BUDGET_S if inline else None, 'persistent_runs': not inline,
            'note': (f'Hosted deployment: each run executes inside one request (budget {jobs.INLINE_BUDGET_S:.0f} s) and the complete '
                     'record is returned to your browser, which keeps the run ledger. Longer cases need a local SOLARIS server.') if inline else
                    'Server deployment: runs execute as background jobs with progress, cancel and a persistent run store.'}


def _bundle_response(b: dict, extra: dict | None = None) -> dict:
    m, st = b['manifest'], b['status']
    return {'run_id': m['run_id'], 'status': st.get('status'), 'input_sha256': m['input_sha256'], 'experiment_id': m.get('experiment_id'),
            'execution': 'inline', **(extra or {}),
            'bundle': {**b, 'passport': build_passport(m, st, b.get('result'))}}


@router.get('/environment/presets')
def env_presets():
    return {'presets': presets(), 'registry': registry()}


@router.post('/mixture/inspect')
def mixture_inspect(comp: Composition):
    return inspect_mixture(comp)


@router.post('/mixture/normalize')
def mixture_normalize(comp: Composition):
    return normalize_mixture(comp)


@router.post('/environment/evaluate')
def env_evaluate(spec: EnvironmentSpec):
    return evaluate_environment(spec)


class ProfileRequest(Strict):
    environment: EnvironmentSpec
    top_m: float | None = None
    points: int = Field(120, ge=10, le=600)


@router.post('/environment/profile')
def env_profile(req: ProfileRequest):
    return hydrostatic_profile(req.environment, req.top_m, req.points)


class RunRequest(Strict):
    kind: Literal['equilibrium', 'reactor', 'premixed_flame', 'counterflow_flame', 'flame_l3', 'coupled_flame']
    spec: dict[str, Any]
    label: str = Field('', max_length=160)
    experiment_id: str | None = Field(None, max_length=120, pattern=r'^[A-Za-z0-9_-]+$')
    environment: dict[str, Any] | None = None     # the EnvironmentSpec this run was derived from (provenance)
    lineage: list[dict[str, Any]] = Field([], max_length=50)


@router.post('/runs')
def create_run(req: RunRequest):
    model = SPEC_MODELS[req.kind]
    spec = model.model_validate(req.spec)
    # Fail fast on physics/capability errors before queueing.
    if req.kind == 'flame_l3':
        Solver(spec)
    elif req.kind == 'counterflow_flame':
        from . import chemistry as _c
        _c._check_state(spec.fuel_temperature_k, spec.pressure_pa); _c._check_state(spec.oxidizer_temperature_k, spec.pressure_pa)
        _c._streams(spec, spec.oxidizer_temperature_k, spec.pressure_pa)
    elif req.kind in ('equilibrium', 'reactor', 'premixed_flame'):
        from . import chemistry as _c
        _c._premix(spec)
    elif req.kind == 'coupled_flame':
        fs, _ = prepare_coupled(spec); Solver(fs)
    extra = {'lineage': req.lineage, 'environment': req.environment}
    if req.kind == 'coupled_flame' or req.experiment_id:
        extra['experiment_id'] = req.experiment_id or ('EXP-' + jobs.sha256(jobs.canonical(req.spec))[:12])
    if jobs.EXECUTION == 'inline':
        return _bundle_response(jobs.run_inline(req.kind, spec.model_dump(mode='json'), label=req.label, extra=extra))
    m = jobs.submit(req.kind, spec.model_dump(mode='json'), label=req.label, extra=extra)
    return {'run_id': m['run_id'], 'status': 'queued', 'input_sha256': m['input_sha256'], 'experiment_id': m.get('experiment_id'), 'execution': 'jobs'}


class ImportRun(Strict):
    kind: Literal['flight', 'saturn_legacy']
    label: str = Field('', max_length=160)
    spec: dict[str, Any]
    result: dict[str, Any]
    experiment_id: str | None = Field(None, max_length=120, pattern=r'^[A-Za-z0-9_-]+$')
    assumptions: list[str] = Field([], max_length=60)


@router.post('/runs/import')
async def import_run(request: Request):
    """Store a browser-computed flight run (flight engine executes client-side) so it gains a run ID, manifest and passport."""
    raw = await request.body()
    if len(raw) > 30_000_000:
        return JSONResponse(status_code=413, content={'error': {'code': 'too_large', 'message': 'Flight record exceeds 30 MB.', 'field': None, 'expected': None, 'recovery': 'Reduce telemetry sampling.'}})
    req = ImportRun.model_validate_json(raw)
    m = jobs.create_run(req.kind, req.spec, label=req.label, status='completed',
                        extra={'experiment_id': req.experiment_id, 'assumptions': req.assumptions, 'executed_in': 'browser (SOLARIS flight engine)'})
    d = jobs.run_dir(m['run_id'])
    jobs._write(d / 'result.json', jobs.clean(req.result))
    st = jobs.set_status(m['run_id'], req.result.get('status', 'completed') if req.result.get('status') in jobs.TERMINAL else 'completed', reason=req.result.get('reason'))
    if jobs.EXECUTION == 'inline':
        result = jobs.clean(req.result)
        resp = _bundle_response({'manifest': m, 'status': st, 'result': result, 'frames': None})
        # The browser already holds the full flight record; do not echo it back.
        resp['bundle'].pop('result', None)
        return resp
    return {'run_id': m['run_id'], 'input_sha256': m['input_sha256'], 'experiment_id': m.get('experiment_id'), 'execution': 'jobs'}


@router.get('/runs')
def list_runs(limit: int = Query(100, ge=1, le=500)):
    if jobs.EXECUTION == 'inline':
        return {'runs': [], 'execution': 'inline', 'note': execution_info()['note']}
    return {'runs': jobs.list_runs(limit), 'execution': 'jobs'}


def _load(run_id):
    try:
        d = jobs.run_dir(run_id)
    except KeyError:
        return None
    m = jobs._read(d / 'manifest.json')
    return None if m is None else (d, m, jobs.get_status(run_id))


@router.get('/runs/{run_id}')
def run_status(run_id: str):
    x = _load(run_id)
    if not x: return not_found(run_id)
    d, m, st = x
    return {**st, 'kind': m['kind'], 'label': m.get('label'), 'input_sha256': m['input_sha256'], 'experiment_id': m.get('experiment_id')}


@router.post('/runs/{run_id}/cancel')
def run_cancel(run_id: str):
    x = _load(run_id)
    if not x: return not_found(run_id)
    return jobs.cancel(run_id)


@router.get('/runs/{run_id}/result')
def run_result(run_id: str):
    x = _load(run_id)
    if not x: return not_found(run_id)
    d, m, st = x
    res = jobs._read(d / 'result.json')
    return {'status': st, 'manifest': m, 'result': res, 'passport': build_passport(m, st, res)}


@router.get('/runs/{run_id}/passport')
def run_passport(run_id: str):
    x = _load(run_id)
    if not x: return not_found(run_id)
    d, m, st = x
    return build_passport(m, st, jobs._read(d / 'result.json'))


def _frame_files(d):
    return sorted(p for p in (d / 'frames').glob('*.npz') if '.tmp' not in p.name)


@router.get('/runs/{run_id}/frames/{index}')
def run_frame(run_id: str, index: int, fields: str = Query('T,hrr', max_length=200)):
    x = _load(run_id)
    if not x: return not_found(run_id)
    files = _frame_files(x[0])
    if not files or not -len(files) <= index < len(files):
        return JSONResponse(status_code=404, content={'error': {'code': 'no_frame', 'message': f'Frame {index} is not available ({len(files)} frames stored).', 'field': 'index', 'expected': None, 'recovery': None}})
    with np.load(files[index]) as z:
        out = {'index': index % len(files), 'count': len(files), 't': float(z['t']), 'available_fields': [k for k in z.files if k != 't'], 'fields': {}}
        for f in fields.split(','):
            if f in z.files and f != 't':
                a = z[f]
                out['nx'], out['ny'] = a.shape
                out['fields'][f] = {'min': float(a.min()), 'max': float(a.max()), 'data': [float(f'{v:.5g}') for v in a.ravel()]}
    return out


def _series_csv(res) -> str:
    rows = res.get('series') or res.get('history') or []
    if isinstance(rows, dict):   # column-oriented
        keys = list(rows); rows = [dict(zip(keys, vals)) for vals in zip(*[rows[k] for k in keys])]
    if not rows and isinstance(res.get('profile'), dict):
        p = res['profile']; keys = [k for k, v in p.items() if isinstance(v, list)]
        rows = [dict(zip(keys, vals)) for vals in zip(*[p[k] for k in keys])]
    buf = io.StringIO()
    if rows:
        keys = [k for k in rows[0] if not isinstance(rows[0][k], (dict, list))]
        w = csv.DictWriter(buf, fieldnames=keys, extrasaction='ignore'); w.writeheader(); w.writerows(rows)
    return buf.getvalue()


def report_markdown(m, st, res, pp) -> str:
    L = [f"# SOLARIS 5.0 run report: {m.get('label') or m['kind']}", '',
         f"- Run ID: `{m['run_id']}`", f"- Experiment ID: `{m.get('experiment_id') or '-'}`", f"- Kind: {m['kind']} (fidelity level {pp['fidelity_level']})",
         f"- Status: **{st.get('status')}**" + (f" - {st.get('reason')}" if st.get('reason') else ''),
         f"- Created (UTC): {m['created_utc']}", f"- Input SHA-256: `{m['input_sha256']}`", f"- Origin: {pp['origin']}", '',
         '## Model', '', str(pp['model']), '']
    if pp.get('chemistry'): L += ['Chemistry: ' + json.dumps(pp['chemistry']), '']
    if pp.get('mechanism'): L += ['Mechanism: ' + json.dumps(pp['mechanism']), '']
    L += ['## Assumptions', ''] + [f'- {a}' for a in pp['assumptions']] + ['']
    if pp.get('applicability'): L += ['## Applicability', '', str(pp['applicability']), '']
    if pp.get('limitations'): L += ['## Limitations', ''] + [f'- {a}' for a in pp['limitations']] + ['']
    L += ['## Validation status', '', pp['validation_status'], '', '### Benchmarks', '', '| ID | Status | Metric | Value | Tolerance |', '|---|---|---|---|---|']
    L += [f"| {b['id']} | {b.get('status')} | {b.get('metric', '')} | {b.get('value', '')} | {b.get('tolerance', '')} |" for b in pp['benchmarks']]
    L += ['', '## Numerical diagnostics', '', '```json', json.dumps(pp['numerical_diagnostics'], indent=1, default=float)[:6000], '```', '']
    if res:
        keys = [k for k, v in res.items() if isinstance(v, (int, float, str)) and k not in ('model',)]
        L += ['## Scalar results', ''] + [f'- {k}: {res[k]}' for k in keys] + ['']
        for k in ('classification', 'ignition', 'final', 'coupling'):
            if res.get(k):
                v = dict(res[k]); v.pop('history', None)
                L += [f'### {k}', '', '```json', json.dumps(v, indent=1, default=float)[:4000], '```', '']
    if st.get('status') != 'completed':
        L += ['> This run did not complete normally. Any partial output is NOT a scientific result.', '']
    L += ['## Software', '', '```json', json.dumps(m.get('versions'), indent=1), '```', '', '## Inputs', '', '```json', json.dumps(pp['inputs'], indent=1, default=float)[:12000], '```']
    return '\n'.join(L)


@router.get('/runs/{run_id}/export')
def run_export(run_id: str, format: Literal['zip', 'csv', 'json', 'md'] = 'zip'):
    x = _load(run_id)
    if not x: return not_found(run_id)
    d, m, st = x
    res = jobs._read(d / 'result.json') or {}
    pp = build_passport(m, st, res)
    if format == 'json':
        return {'manifest': m, 'status': st, 'passport': pp, 'result': res}
    if format == 'csv':
        return Response(_series_csv(res), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="{run_id}_series.csv"'})
    md = report_markdown(m, st, res, pp)
    if format == 'md':
        return Response(md, media_type='text/markdown', headers={'Content-Disposition': f'attachment; filename="{run_id}_report.md"'})
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', json.dumps(m, indent=1)); z.writestr('status.json', json.dumps(st, indent=1))
        z.writestr('passport.json', json.dumps(pp, indent=1, default=float)); z.writestr('result.json', json.dumps(res))
        sc = _series_csv(res)
        if sc: z.writestr('series.csv', sc)
        z.writestr('report.md', md)
        if res.get('flight_samples'):
            b = io.StringIO(); w = csv.writer(b); w.writerow(['t_flight_s', 'fx_body', 'fy_body', 'fz_body', 'wx', 'wy', 'wz'])
            for s in res['flight_samples']: w.writerow([s['t'], *s['specific_force_body'], *s['omega_body']])
            z.writestr('flight_specific_force.csv', b.getvalue())
        for f in _frame_files(d): z.write(f, f'frames/{f.name}')
        z.writestr('README.txt', 'SOLARIS 5.0 run export. frames/*.npz are NumPy archives (fields on the cell-centred grid, SI units). '
                                 'series.csv: time series (present when the model produces one). passport.json: provenance, assumptions, benchmarks. Simulation-derived data, not NASA measurements.\n')
    return Response(buf.getvalue(), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="{run_id}.zip"'})


class ExportRequest(Strict):
    manifest: dict[str, Any]
    status: dict[str, Any]
    result: dict[str, Any] | None = None
    frames: dict[str, Any] | None = None


@router.post('/runs/export')
async def run_export_stateless(request: Request, format: Literal['zip', 'csv', 'md'] = 'zip'):
    """Build the same export bundle from a run record held by the browser (hosted / inline mode)."""
    raw = await request.body()
    if len(raw) > 4_000_000:
        return JSONResponse(status_code=413, content={'error': {'code': 'too_large', 'message': 'The run record is too large to export on the hosted service.', 'field': None, 'expected': None,
                                                                'recovery': 'Use “Run record (JSON)”, which is generated in your browser.'}})
    req = ExportRequest.model_validate_json(raw)
    m, st, res = req.manifest, req.status, req.result or {}
    if 'run_id' not in m or 'kind' not in m or 'created_utc' not in m:
        return JSONResponse(status_code=422, content={'error': {'code': 'schema', 'message': 'Run record is missing manifest fields.', 'field': 'manifest', 'expected': 'run_id, kind, created_utc', 'recovery': None}})
    pp = build_passport(m, st, res)
    rid = re.sub(r'[^A-Za-z0-9_-]', '_', str(m['run_id']))[:120]
    if format == 'csv':
        return Response(_series_csv(res), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="{rid}_series.csv"'})
    md = report_markdown(m, st, res, pp)
    if format == 'md':
        return Response(md, media_type='text/markdown', headers={'Content-Disposition': f'attachment; filename="{rid}_report.md"'})
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', json.dumps(m, indent=1)); z.writestr('status.json', json.dumps(st, indent=1))
        z.writestr('passport.json', json.dumps(pp, indent=1, default=float)); z.writestr('result.json', json.dumps(res))
        sc = _series_csv(res)
        if sc: z.writestr('series.csv', sc)
        z.writestr('report.md', md)
        if req.frames and req.frames.get('items'):
            z.writestr('frames.json', json.dumps(req.frames))
        z.writestr('README.txt', 'SOLARIS run export (hosted). frames.json holds the solver output frames returned by the hosted service (subsampled; see its note). '
                                 'series.csv: time series. passport.json: provenance, assumptions, benchmarks. Simulation-derived data, not NASA measurements.\n')
    return Response(buf.getvalue(), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="{rid}.zip"'})


# ---------------------------------------------------------------- scenarios
def _scen_files():
    out = {}
    for base, origin in ((SCEN_DIR, 'bundled'), (USER_SCEN_DIR, 'user')):
        if base.exists():
            for p in sorted(base.glob('*.json')):
                out[p.stem] = (p, origin)
    return out


@router.get('/scenarios')
def scenarios():
    items = []
    for sid, (p, origin) in _scen_files().items():
        try:
            s = json.loads(p.read_text(encoding='utf-8'))
            items.append({'id': sid, 'origin': origin, **{k: s.get(k) for k in ('title', 'destination', 'kind', 'summary', 'fidelity_level', 'expected_runtime', 'order')}})
        except json.JSONDecodeError:
            items.append({'id': sid, 'origin': origin, 'title': sid, 'error': 'Scenario file is not valid JSON.'})
    return {'scenarios': sorted(items, key=lambda q: (q.get('order') or 999, q['id']))}


@router.get('/scenarios/{sid}')
def scenario(sid: str):
    f = _scen_files().get(sid)
    if not f:
        return JSONResponse(status_code=404, content={'error': {'code': 'not_found', 'message': f'Scenario {sid!r} does not exist.', 'field': 'id', 'expected': None, 'recovery': None}})
    return {'id': sid, 'origin': f[1], **json.loads(f[0].read_text(encoding='utf-8'))}


class ScenarioSave(Strict):
    title: str = Field(..., min_length=1, max_length=120)
    destination: Literal['world', 'flame', 'flight', 'coupled']
    kind: str = Field('', max_length=40)
    summary: str = Field('', max_length=600)
    payload: dict[str, Any]


@router.post('/scenarios')
def scenario_save(s: ScenarioSave):
    if jobs.EXECUTION == 'inline':
        return JSONResponse(status_code=409, content={'error': {'code': 'not_persistent', 'message': 'The hosted deployment has no persistent scenario store.',
                                                                'field': None, 'expected': None, 'recovery': 'SOLARIS keeps saved scenarios in this browser instead.'}})
    USER_SCEN_DIR.mkdir(parents=True, exist_ok=True)
    sid = 'user-' + (re.sub(r'[^a-z0-9]+', '-', s.title.lower()).strip('-')[:50] or 'scenario') + '-' + jobs.sha256(jobs.canonical(s.payload))[:6]
    body = {'schema_version': SCHEMA_VERSION, **s.model_dump()}
    jobs._write(USER_SCEN_DIR / f'{sid}.json', json.dumps(body, indent=1))
    return {'id': sid, 'origin': 'user'}
