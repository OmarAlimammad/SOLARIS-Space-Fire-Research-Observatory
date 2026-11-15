"""Install SOLARIS Data Atlas v2 without touching source CSV, FastAPI, or Home."""
from __future__ import annotations
from pathlib import Path
from datetime import datetime
import shutil
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PAYLOAD = HERE / 'payload'
TARGETS = [
    'frontend/src/pages/Explore.jsx',
    'frontend/src/features/data-atlas/analysis.js',
    'frontend/src/features/data-atlas/dashboard.css',
    'frontend/tests/data-atlas.test.mjs',
]
WORKSPACE = ROOT / 'frontend/src/features/compatibility/CompatibilityWorkspace.jsx'
BEFORE = """        setFirstId(items[0]?.id || '');
        setSecondId(items[1]?.id || '');"""
AFTER = """        // Accept validated test IDs from the Data Atlas deep link.
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const requestedFirst = params.get('first');
        const requestedSecond = params.get('second');
        const knownIds = new Set(items.map(item => item.id));
        setFirstId(knownIds.has(requestedFirst) ? requestedFirst : items[0]?.id || '');
        setSecondId(knownIds.has(requestedSecond) ? requestedSecond : items[1]?.id || '');"""

def main():
    if not (ROOT/'backend/main.py').is_file() or not (ROOT/'frontend/package.json').is_file():
        sys.exit('ERROR: Place the SOLARIS_Dashboard_Patch_v1 folder inside SOLARIS_Research_Platform_v1 and run from there.')
    if not WORKSPACE.is_file():
        sys.exit('ERROR: The earlier Compatibility Engine patch is missing. Install that first; no changes made.')
    existing=WORKSPACE.read_text(encoding='utf-8')
    if BEFORE not in existing and AFTER not in existing:
        sys.exit('ERROR: CompatibilityWorkspace.jsx differs from expected version. No changes made; request a compatible patch.')
    if not all((PAYLOAD/p).is_file() for p in TARGETS):
        sys.exit('ERROR: Incomplete patch payload. No changes made.')
    current_explore=ROOT/'frontend/src/pages/Explore.jsx'
    if not current_explore.exists():
        sys.exit('ERROR: Explore.jsx not found. No changes made.')
    if 'className="atlas-page"' in current_explore.read_text(encoding='utf-8'):
        print('Dashboard v2 appears to be already installed. Reinstallation skipped.');return

    backup=ROOT/('SOLARIS_BACKUP_DASHBOARD_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
    backup.mkdir()
    try:
        for rel in TARGETS:
            dest=ROOT/rel
            if dest.exists():
                original=backup/rel
                original.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(dest,original)
        dst=backup/'frontend/src/features/compatibility/CompatibilityWorkspace.jsx'
        dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(WORKSPACE,dst)
        for rel in TARGETS:
            dest=ROOT/rel
            dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(PAYLOAD/rel,dest)
        if BEFORE in existing:
            WORKSPACE.write_text(existing.replace(BEFORE,AFTER,1),encoding='utf-8')
    except Exception:
        print('Installation failed; restore files from:',backup)
        raise
    print('SOLARIS Scientific Data Atlas v2 installed.')
    print('Backups:',backup)
    print('Preserved: Home, data CSV, backend, existing Compatibility Engine computation.')
    print('Next: cd frontend; npm.cmd run build  (Windows)')
    print('Then open http://localhost:5173/#/explore and select two tests for Research Studio.')

if __name__=='__main__': main()
