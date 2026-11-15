"""Run store and process-based job execution for long simulations.

Each run lives in <run_root>/<run_id>/ with manifest.json, status.json, progress.json,
result.json and (Level 3) frames/NNNNN.npz.  Jobs execute in separate processes so that the API
stays responsive and cancel/timeout are always enforceable (the process is terminated).
"""
from __future__ import annotations

import hashlib
import json
import multiprocessing as mp
import os
import platform
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from . import SCHEMA_VERSION, SOFTWARE_VERSION

# Execution modes (added when merging SOLARIS 5.0 into the live site):
#   'jobs'   — long-running server (local `uvicorn`): background processes, polling, unchanged 5.0 behaviour.
#   'inline' — serverless deployment (Vercel): the run executes inside the request within a wall-clock budget and
#              the complete record (manifest, status, result, passport, frames) is returned to the browser, which keeps
#              the run ledger. Serverless instances have no persistent disk and no background processes.
_SERVERLESS = bool(os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'))
EXECUTION = os.environ.get('SOLARIS_EXECUTION') or ('inline' if _SERVERLESS else 'jobs')
INLINE_BUDGET_S = float(os.environ.get('SOLARIS_INLINE_BUDGET_S', '240'))
INLINE_MAX_FRAME_VALUES = int(os.environ.get('SOLARIS_INLINE_MAX_FRAME_VALUES', '250000'))
_DEFAULT_RUN_DIR = Path('/tmp/solaris-runs') if _SERVERLESS else Path(__file__).resolve().parents[2] / 'var' / 'runs'
ROOT = Path(os.environ.get('SOLARIS_RUN_DIR', _DEFAULT_RUN_DIR))
MAX_CONCURRENT = int(os.environ.get('SOLARIS_MAX_JOBS', '2'))
TERMINAL = {'completed', 'failed', 'canceled', 'timed_out', 'non_converged'}
KIND_TIMEOUT = {'equilibrium': 60, 'reactor': 300, 'premixed_flame': 900, 'counterflow_flame': 900, 'flame_l3': 4 * 3600, 'coupled_flame': 4 * 3600}
_lock = threading.Lock()
_procs: dict[str, mp.Process] = {}
_queue: list[str] = []


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), default=float)


def sha256(text: str | bytes) -> str:
    return hashlib.sha256(text.encode() if isinstance(text, str) else text).hexdigest()


def _write(path: Path, obj):
    tmp = path.with_suffix(path.suffix + f'.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(obj, default=float, allow_nan=False) if not isinstance(obj, str) else obj, encoding='utf-8')
    os.replace(tmp, path)


def _read(path: Path, default=None):
    for _ in range(3):
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            return default
        except (json.JSONDecodeError, PermissionError):
            time.sleep(0.02)
    return default


def clean(o):
    """Make a result JSON-safe: numpy -> python, non-finite -> None."""
    import numpy as np
    if isinstance(o, dict): return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, np.ndarray): return clean(o.tolist())
    if isinstance(o, (np.floating, float)):
        f = float(o); return f if f == f and abs(f) != float('inf') else None
    if isinstance(o, np.integer): return int(o)
    if isinstance(o, np.bool_): return bool(o)
    return o


def run_dir(run_id: str) -> Path:
    if not run_id or any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_' for c in run_id):
        raise KeyError(run_id)
    return ROOT / run_id


def versions() -> dict:
    import cantera, numpy, scipy
    return {'solaris': SOFTWARE_VERSION, 'schema': SCHEMA_VERSION, 'python': platform.python_version(), 'cantera': cantera.__version__,
            'numpy': numpy.__version__, 'scipy': scipy.__version__, 'platform': platform.platform()}


def mechanism_hashes() -> dict:
    import cantera as ct
    out = {}
    for name in ('gri30.yaml', 'h2o2.yaml'):
        for d in ct.get_data_directories():
            p = Path(d) / name
            if p.exists():
                out[name] = sha256(p.read_bytes()); break
    return out


def create_run(kind: str, spec: dict, *, label: str = '', extra: dict | None = None, status: str = 'queued') -> dict:
    h = sha256(canonical({'kind': kind, 'spec': spec}))
    now = datetime.now(timezone.utc)
    run_id = f"S5-{kind.replace('_', '')[:10]}-{now.strftime('%Y%m%dT%H%M%S')}-{h[:8]}-{os.urandom(2).hex()}"
    d = ROOT / run_id; (d / 'frames').mkdir(parents=True, exist_ok=True)
    manifest = {'run_id': run_id, 'kind': kind, 'label': label[:160], 'created_utc': now.isoformat(), 'schema_version': SCHEMA_VERSION,
                'input_sha256': h, 'spec': spec, 'versions': versions(), 'mechanism_file_sha256': mechanism_hashes(), **(extra or {})}
    _write(d / 'manifest.json', manifest)
    _write(d / 'status.json', {'run_id': run_id, 'status': status, 'created_utc': now.isoformat()})
    return manifest


def set_status(run_id: str, status: str, **kw):
    d = run_dir(run_id); cur = _read(d / 'status.json', {}) or {}
    cur.update(status=status, updated_utc=datetime.now(timezone.utc).isoformat(), **kw)
    _write(d / 'status.json', cur)
    return cur


def get_status(run_id: str) -> dict | None:
    d = run_dir(run_id); st = _read(d / 'status.json')
    if st is None: return None
    st['progress'] = _read(d / 'progress.json')
    st['frames_available'] = len(list((d / 'frames').glob('*.npz'))) if (d / 'frames').exists() else 0
    with _lock:
        if run_id in _queue: st['queue_position'] = _queue.index(run_id) + 1
    return st


def list_runs(limit: int = 100) -> list[dict]:
    out = []
    if not ROOT.exists(): return out
    for d in sorted(ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]:
        m, s = _read(d / 'manifest.json'), _read(d / 'status.json')
        if m and s:
            out.append({'run_id': m['run_id'], 'kind': m['kind'], 'label': m.get('label', ''), 'created_utc': m['created_utc'], 'status': s['status'], 'experiment_id': m.get('experiment_id')})
    return out


# ---------------------------------------------------------------- worker (child process)
def _execute(kind: str, spec: dict, d: Path, *, should_stop=None, frame_sink=None):
    import numpy as np
    last = [0.0]

    def progress(frac, info=None):
        if should_stop is not None and should_stop():
            raise BudgetExceeded()
        if time.time() - last[0] > 0.4:
            last[0] = time.time(); _write(d / 'progress.json', clean({'fraction': frac, 'info': info}))

    if kind in ('equilibrium', 'reactor', 'premixed_flame', 'counterflow_flame'):
        from . import chemistry as c
        fn, model = {'equilibrium': (c.equilibrium, c.EquilibriumSpec), 'reactor': (c.reactor, c.ReactorSpec),
                     'premixed_flame': (c.premixed_flame, c.PremixedFlameSpec), 'counterflow_flame': (c.counterflow_flame, c.CounterflowSpec)}[kind]
        s = model.model_validate(spec)
        return fn(s) if kind == 'equilibrium' else fn(s, progress)
    from .lowmach import FlameL3Spec, run_flame_l3
    extra = {}
    if kind == 'coupled_flame':
        from .coupling import CoupledSpec, prepare_coupled
        cs = CoupledSpec.model_validate(spec)
        fs, extra = prepare_coupled(cs)
        extra = {'coupling': extra, 'flight': {k: v for k, v in cs.flight.model_dump().items() if k != 'samples'},
                 'flight_samples': [q.model_dump() for q in cs.flight.samples], 'chamber': cs.chamber.model_dump()}
    else:
        fs = FlameL3Spec.model_validate(spec)

    def on_frame(i, fr, diag):
        if frame_sink is not None:
            frame_sink.append({k: (v.copy() if hasattr(v, 'copy') else v) for k, v in fr.items()}); return
        tmp = d / 'frames' / f'{i:05d}.tmp.npz'
        np.savez_compressed(tmp, **fr); os.replace(tmp, d / 'frames' / f'{i:05d}.npz')

    def l3_progress(frac, info=None):
        try:
            progress(frac, info)
        except BudgetExceeded:
            pass   # the solver itself polls should_stop and ends with status 'canceled'

    res, _ = run_flame_l3(fs, l3_progress, should_stop, on_frame)
    res.update(extra)
    return res


def _worker(kind: str, spec: dict, dpath: str):
    d = Path(dpath)
    from .errors import SimError
    try:
        res = clean(_execute(kind, spec, d))
        _write(d / 'result.json', res)
        _write(d / 'outcome.json', {'status': res.get('status', 'completed'), 'reason': res.get('reason')})
    except SimError as e:
        _write(d / 'outcome.json', {'status': 'failed', 'reason': e.message, 'error': e.as_dict()})
    except Exception as e:  # noqa: BLE001 - reported to the user, never swallowed
        _write(d / 'outcome.json', {'status': 'failed', 'reason': f'{type(e).__name__}: {e}', 'traceback': traceback.format_exc()[-3000:]})


def _supervise(run_id: str, kind: str, spec: dict, timeout: float):
    d = run_dir(run_id)
    ctx = mp.get_context('spawn')
    p = ctx.Process(target=_worker, args=(kind, spec, str(d)), daemon=True)
    with _lock:
        if (_read(d / 'status.json') or {}).get('status') == 'canceled':
            _queue.remove(run_id) if run_id in _queue else None
            return
        _procs[run_id] = p
        if run_id in _queue: _queue.remove(run_id)
    t0 = time.time(); p.start(); set_status(run_id, 'running', started_utc=datetime.now(timezone.utc).isoformat())
    p.join(timeout)
    timed_out = p.is_alive()
    if timed_out:
        p.terminate(); p.join(5)
    with _lock: _procs.pop(run_id, None)
    cur = _read(d / 'status.json') or {}
    if cur.get('status') == 'canceled': return
    out = _read(d / 'outcome.json')
    if timed_out:
        set_status(run_id, 'timed_out', reason=f'Exceeded the {timeout:.0f} s wall-clock limit; the process was terminated. No result is reported.', wall_time_s=time.time() - t0)
    elif out is None:
        set_status(run_id, 'failed', reason=f'Worker process exited (code {p.exitcode}) without a result.', wall_time_s=time.time() - t0)
    else:
        st = out['status'] if out['status'] in TERMINAL else 'completed'
        set_status(run_id, st, reason=out.get('reason'), error=out.get('error'), wall_time_s=time.time() - t0)


_sem = threading.Semaphore(MAX_CONCURRENT)


def submit(kind: str, spec: dict, *, label: str = '', extra: dict | None = None, timeout: float | None = None) -> dict:
    manifest = create_run(kind, spec, label=label, extra=extra)
    rid = manifest['run_id']
    with _lock: _queue.append(rid)

    def go():
        with _sem:
            _supervise(rid, kind, spec, timeout or KIND_TIMEOUT.get(kind, 900))
    threading.Thread(target=go, daemon=True, name=f'job-{rid}').start()
    return manifest


def cancel(run_id: str) -> dict:
    st = get_status(run_id)
    if st is None: raise KeyError(run_id)
    if st['status'] in TERMINAL: return st
    set_status(run_id, 'canceled', reason='Canceled by user. Partial output is not a result.')
    with _lock: p = _procs.get(run_id)
    if p is not None and p.is_alive(): p.terminate()
    return get_status(run_id)


def recover_orphans():
    """On server start: runs left 'running'/'queued' by a previous process cannot be resumed."""
    if not ROOT.exists(): return
    for d in ROOT.iterdir():
        s = _read(d / 'status.json')
        if s and s.get('status') in ('running', 'queued'):
            set_status(d.name, 'failed', reason='Server restarted while this run was active; it was not resumed.')


# ---------------------------------------------------------------- inline execution (serverless)
class BudgetExceeded(Exception):
    """Raised inside a progress callback when the inline wall-clock budget is used up."""


def _inline_frames(frames: list) -> dict:
    """Subsample stored solver frames so the response stays small. Values are the solver's cell values (5 s.f.)."""
    if not frames:
        return {'count': 0, 'stored': 0, 'fields': [], 'items': []}
    keys = [k for k in frames[0] if k != 't']
    preferred = [k for k in ('T', 'hrr', 'X_O2', 'u', 'v', 'rho', 'X_CO2', 'X_H2O', 'X_CH4', 'X_H2', 'p_dyn', 'X_N2') if k in keys]
    keys = preferred + [k for k in keys if k not in preferred]
    cells = int(frames[0][keys[0]].size) if keys else 1
    n_fields = len(keys)
    while n_fields > 2 and cells * n_fields * min(len(frames), 12) > INLINE_MAX_FRAME_VALUES:
        n_fields -= 1
    keep = keys[:n_fields]
    max_frames = max(2, INLINE_MAX_FRAME_VALUES // max(1, cells * len(keep)))
    if len(frames) <= max_frames:
        idx = list(range(len(frames)))
    else:
        step = (len(frames) - 1) / (max_frames - 1)
        idx = sorted({round(i * step) for i in range(max_frames)})
    items = []
    for i in idx:
        fr = frames[i]; out = {'source_index': i, 't': float(fr['t']), 'fields': {}}
        for k in keep:
            a = fr[k]; out['nx'], out['ny'] = a.shape
            out['fields'][k] = {'min': float(a.min()), 'max': float(a.max()), 'data': [float(f'{v:.5g}') for v in a.ravel()]}
        items.append(out)
    return {'count': len(items), 'stored': len(frames), 'fields': keep, 'all_fields': keys, 'items': items,
            'note': (f'{len(items)} of {len(frames)} solver output frames returned' + (f'; fields limited to {", ".join(keep)}' if len(keep) < len(keys) else '')
                     + ' to keep the hosted response small. Values are unmodified solver cell values rounded to 5 significant figures.')}


def run_inline(kind: str, spec: dict, *, label: str = '', extra: dict | None = None, budget_s: float | None = None) -> dict:
    """Execute a run inside the current request. Returns the complete run record."""
    from .errors import SimError
    budget = budget_s or INLINE_BUDGET_S
    manifest = create_run(kind, spec, label=label, extra={**(extra or {}), 'executed_in': 'hosted serverless function (inline)'})
    rid = manifest['run_id']; d = run_dir(rid)
    t0 = time.time(); deadline = t0 + budget
    should_stop = lambda: time.time() > deadline   # noqa: E731
    frames: list = []
    set_status(rid, 'running', started_utc=datetime.now(timezone.utc).isoformat())
    result = None
    try:
        result = clean(_execute(kind, spec, d, should_stop=should_stop, frame_sink=frames))
        st = result.get('status', 'completed')
        if st == 'canceled' and time.time() > deadline:
            status = set_status(rid, 'timed_out', wall_time_s=time.time() - t0,
                                reason=f'Exceeded the hosted compute budget of {budget:.0f} s and was stopped. Partial output is not a result. '
                                       'Reduce the grid or simulated duration, or run SOLARIS locally (no budget limit).')
        else:
            status = set_status(rid, st if st in TERMINAL else 'completed', reason=result.get('reason'), wall_time_s=time.time() - t0)
        _write(d / 'result.json', result)
    except BudgetExceeded:
        status = set_status(rid, 'timed_out', wall_time_s=time.time() - t0,
                            reason=f'Exceeded the hosted compute budget of {budget:.0f} s and was stopped. No result is reported. Run SOLARIS locally for longer cases.')
    except SimError as e:
        status = set_status(rid, 'failed', reason=e.message, error=e.as_dict(), wall_time_s=time.time() - t0)
    except Exception as e:  # noqa: BLE001 - reported to the user, never swallowed
        status = set_status(rid, 'failed', reason=f'{type(e).__name__}: {e}', wall_time_s=time.time() - t0)
    status = get_status(rid) or status
    status['frames_available'] = len(frames)
    return {'manifest': manifest, 'status': status, 'result': result, 'frames': _inline_frames(frames) if status.get('status') == 'completed' else None}
