"""Entry point for `python -m uvicorn main:app` (run from backend/) and `backend.main` imports.

All routes live in backend/app.py; this shim lets both launch styles work.
"""
from __future__ import annotations

import sys
from pathlib import Path

if __package__:
    from .app import app, load_original_records  # noqa: F401
else:  # launched as a top-level module from inside backend/
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from backend.app import app, load_original_records  # noqa: F401
