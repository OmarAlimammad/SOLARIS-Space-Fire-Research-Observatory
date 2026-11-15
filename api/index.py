"""Vercel serverless entry point: exposes the FastAPI app from backend/app.py."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# /api/v5/* is served by api/sim.py (see vercel.json); keep this function free of the scientific stack.
os.environ.setdefault("SOLARIS_SKIP_SIMULATION", "1")

from backend.app import app  # noqa: E402,F401
