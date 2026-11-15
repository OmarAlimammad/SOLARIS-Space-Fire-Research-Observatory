"""Attach the SOLARIS simulation API (/api/v5: World Builder, Flame Laboratory, flight runs, scenarios).

Used by the local server (backend/app.py) and by the dedicated Vercel function (api/sim.py).
If the scientific stack (numpy, scipy, cantera) is not installed, every /api/v5 route answers
503 with a structured, actionable error instead of breaking the rest of the research API.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

UNAVAILABLE = {
    'code': 'simulation_unavailable',
    'message': 'The SOLARIS simulation engine is not installed on this server.',
    'field': None,
    'expected': 'numpy, scipy and cantera (see requirements.txt)',
    'recovery': 'Install the backend requirements (python -m pip install -r requirements.txt) and restart the API. '
                'The Flight Laboratory runs in your browser and does not need the engine.',
}


def register(app: FastAPI) -> bool:
    """Include the v5 router. Returns True when the engine is available."""
    try:
        from pydantic import ValidationError
        from .sim import jobs
        from .sim.api import router, sim_error_response, validation_response
        from .sim.errors import SimError
    except ImportError as exc:  # scientific dependencies missing
        detail = f'{type(exc).__name__}: {exc}'

        @app.api_route('/api/v5/{rest:path}', methods=['GET', 'POST'], include_in_schema=False)
        async def _sim_unavailable(rest: str):
            return JSONResponse(status_code=503, content={'error': {**UNAVAILABLE, 'detail': detail}})
        return False

    app.include_router(router)

    @app.exception_handler(SimError)
    async def _handle_sim_error(request: Request, exc: SimError):
        return sim_error_response(exc)

    @app.exception_handler(ValidationError)
    async def _handle_validation_error(request: Request, exc: ValidationError):
        return validation_response(exc)

    if jobs.EXECUTION == 'jobs':
        @app.on_event('startup')
        def _recover_runs():
            jobs.recover_orphans()
    return True
