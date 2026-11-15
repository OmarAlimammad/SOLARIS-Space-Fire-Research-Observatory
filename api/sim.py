"""Vercel serverless entry point for the SOLARIS simulation API (/api/v5/*).

Kept separate from api/index.py so the evidence API does not import the scientific stack
(numpy, scipy, cantera) on every cold start, and so it can have a longer maxDuration.
Runs execute inline (within the request) in this deployment; see backend/sim/jobs.py.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('SOLARIS_EXECUTION', 'inline')

from fastapi import FastAPI  # noqa: E402

from backend.sim_mount import register  # noqa: E402

app = FastAPI(title='SOLARIS Simulation API', version='5.0.0')
register(app)


@app.get('/api/v5/health')
def sim_health():
    from backend.sim import jobs
    return {'status': 'ok', 'execution': jobs.EXECUTION}
