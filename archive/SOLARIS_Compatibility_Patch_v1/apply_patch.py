"""Apply the isolated Experiment Compatibility & Evidence Passport patch.

Usage from the root of SOLARIS_Research_Platform_v1:
    python path/to/SOLARIS_Compatibility_Patch_v1/apply_patch.py

Or explicitly:
    python apply_patch.py "C:\\...\\SOLARIS_Research_Platform_v1"

No third-party Python packages are needed to apply the patch.
"""
from __future__ import annotations

import datetime
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAYLOAD = HERE / 'payload'
FILE_LIST = [
    'backend/main.py',
    'backend/scientific/__init__.py',
    'backend/scientific/compatibility.py',
    'frontend/src/lib/api.js',
    'frontend/src/pages/Research.jsx',
    'frontend/src/features/compatibility/CompatibilityWorkspace.jsx',
    'frontend/src/features/compatibility/compatibility.css',
    'tests/test_compatibility.py',
]
# Protect against accidentally overwriting the wrong SOLARIS project.
EXPECTED_MARKERS = {
    'backend/main.py': ['def load_original_records()', 'def records_or_503()', '@app.get("/api/metadata")'],
    'frontend/src/lib/api.js': ['export const getExperiments', 'getMetadata'],
    'frontend/src/pages/Research.jsx': ['export default function Research', 'researchModules'],
}


def main() -> None:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
    if not (root / 'frontend/src/pages/Research.jsx').is_file() or not (root / 'backend/main.py').is_file():
        raise SystemExit('ERROR: Run from SOLARIS_Research_Platform_v1, or supply its full path. No files changed.')
    if not (root / 'data/raw/bassii_nasa_original.csv').is_file():
        raise SystemExit('ERROR: Original NASA CSV is missing. No files changed.')
    for relative, markers in EXPECTED_MARKERS.items():
        text = (root / relative).read_text(encoding='utf-8')
        if not all(marker in text for marker in markers):
            raise SystemExit(f'ERROR: Unexpected structure in {relative}; no files changed.')
    for relative in FILE_LIST:
        dest = root / relative
        src = PAYLOAD / relative
        if not src.is_file():
            raise SystemExit(f'ERROR: Patch is incomplete: {relative}; no files changed.')
        # Avoid erasing user-created modules or customized tools.
        if dest.is_file() and relative not in EXPECTED_MARKERS and dest.read_bytes() != src.read_bytes():
            raise SystemExit(f'ERROR: Existing custom file would be overwritten: {relative}; no files changed.')
        if dest.is_file() and relative in EXPECTED_MARKERS:
            if 'SOLARIS_COMPAT_PATCH_APPLIED' in dest.read_text(encoding='utf-8'):
                raise SystemExit('This compatibility patch appears to be installed already; no files changed.')

    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = root / f'SOLARIS_BACKUP_COMPATIBILITY_{timestamp}'
    backup.mkdir(parents=False, exist_ok=False)
    for relative in FILE_LIST:
        dest = root / relative
        if dest.exists():
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dest, saved)

    for relative in FILE_LIST:
        dest = root / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(PAYLOAD / relative, dest)

    print('SOLARIS Compatibility Engine + Evidence Passport installed.')
    print('Previous files backed up at:', backup)
    print('Unmodified: Home.jsx, home.css, Explore.jsx and the original NASA CSV.')
    print('Next: restart FastAPI, then open Research Studio in the browser.')


if __name__ == '__main__':
    main()
