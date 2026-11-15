"""Registry of the NASA PSI experimental tables held unchanged in data/raw/.

Origin: SOLARIS 4.0/5.0 source-table inventory (scientific/catalog.py), merged into the
live SOLARIS research API. Every file is kept byte-for-byte as supplied; hashes are listed
in data/SOURCE_FILE_SHA256_MANIFEST.txt and asserted by the test suite.

Provenance check added during the merge: each file's name and byte size is compared with the
experimental-table entry that the public NASA PSI record lists (data/catalog/psi_investigations.json).
A match is evidence that the file is the PSI-listed table; PSI does not publish content hashes,
so byte identity with the PSI download is not independently proven.
"""
from __future__ import annotations

import csv
import json
from functools import lru_cache
from io import StringIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data' / 'raw'
PSI_SNAPSHOT = ROOT / 'data' / 'catalog' / 'psi_investigations.json'

# (key, name, topic, accession, [relative files])
INVESTIGATIONS = [
    ('BASS', 'Burning and Suppression of Solids', 'Solid fuel combustion', 'PSI-26', ['bass/PSI-26_Experimental table_BASS.csv']),
    ('BASS-II', 'Burning and Suppression of Solids II', 'Solid fuel combustion', 'PSI-25', ['bassii_nasa_original.csv']),
    ('ACME', 'Advanced Combustion via Microgravity Experiments', 'Gas combustion', 'PSI-10',
     ['acme/PSI-10_Experimental table_Flame Design_Normal Flame.csv', 'acme/PSI-10_Experimental table_Flame Design_Inverse Flame.csv']),
    ('FLEX', 'Flame Extinguishment Experiment', 'Liquid fuel combustion', 'PSI-69', ['flex/PSI-69_Experimental table_FLEX.csv']),
    ('FLEX-2', 'Flame Extinguishment Experiment 2', 'Liquid fuel combustion', 'PSI-68', ['flex2/PSI-68_Experimental table_Flex2.csv']),
    ('SAFFIRE-I', 'Spacecraft Fire Experiment I', 'Spacecraft fire safety', 'PSI-98', ['saffire1/PSI-98_Experimental table_SAFFIRE-1.csv']),
    ('SAFFIRE-II', 'Spacecraft Fire Experiment II', 'Spacecraft fire safety', 'PSI-99', ['saffire2/PSI-99_Experimental table_SAFFIRE-2.csv']),
    ('SAFFIRE-III', 'Spacecraft Fire Experiment III', 'Spacecraft fire safety', 'PSI-100', ['saffire3/PSI-100_Experimental table_SAFFIRE-3.csv']),
    ('SAME', 'Smoke Aerosol Measurement Experiment', 'Smoke and particles', 'PSI-102', ['same/PSI-102_Experimental table_SAME.csv']),
    ('SAME-R', 'Smoke Aerosol Measurement Experiment Reflight', 'Smoke and particles', 'PSI-101', ['same_r/PSI-101_Experimental table_SAME-R.csv']),
    ('SPICE', 'Smoke Point in Co-flow Experiment', 'Soot formation', 'PSI-107', ['spice/PSI-107_Experimental table_Spice.csv']),
]
# The BASS-II file was stored under a descriptive name before the merge; PSI lists it under this name.
PSI_NAME_ALIASES = {'bassii_nasa_original.csv': 'PSI-25_Experimental table_BASS-II.csv'}


def psi_url(accession: str) -> str:
    return f'https://psi.nasa.gov/physci/repo/data/investigations/{accession}'


@lru_cache(maxsize=1)
def _psi_tables() -> dict:
    try:
        snap = json.loads(PSI_SNAPSHOT.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {'retrieved_utc': None, 'tables': {}}
    tables = {}
    for inv in snap.get('investigations', []):
        for rec in inv.get('psi_records', []):
            for t in rec.get('experimental_tables', []):
                tables[t['file_name']] = {**t, 'accession': rec['accession'], 'psi_url': rec['psi_url'], 'investigation': inv['id']}
    return {'retrieved_utc': snap.get('retrieved_utc'), 'tables': tables}


def psi_listing(relative_file: str, size_bytes: int | None) -> dict:
    """Compare a local file with the PSI public file listing (name + byte size)."""
    name = Path(relative_file).name
    listed_name = PSI_NAME_ALIASES.get(name, name)
    psi = _psi_tables()
    entry = psi['tables'].get(listed_name)
    if entry is None:
        return {'status': 'not_listed', 'listed_name': listed_name, 'retrieved_utc': psi['retrieved_utc'],
                'statement': 'No experimental table with this name appears in the PSI metadata snapshot.'}
    matched = size_bytes is not None and entry['size_bytes'] == size_bytes
    return {'status': 'name_and_size_match' if matched else 'size_mismatch', 'listed_name': listed_name,
            'listed_size_bytes': entry['size_bytes'], 'local_size_bytes': size_bytes, 'accession': entry['accession'],
            'psi_url': entry['psi_url'], 'retrieved_utc': psi['retrieved_utc'],
            'statement': (f"File name and byte size ({entry['size_bytes']} B) match the experimental table listed on NASA PSI record "
                          f"{entry['accession']} (public metadata snapshot retrieved {str(psi['retrieved_utc'])[:10]}). PSI does not publish "
                          'content hashes, so byte identity with the PSI download is not independently proven.') if matched else
                         (f"PSI lists {listed_name} with {entry['size_bytes']} B but the local file has {size_bytes} B. Treat as unverified.")}


def read_csv(path: Path):
    """Raw strings only: units and descriptors can be embedded in cells."""
    from .foundation import decode_source
    text, _ = decode_source(path.read_bytes())
    with StringIO(text, newline='') as f:
        reader = csv.DictReader(f)
        return reader.fieldnames or [], list(reader)


def site_investigation_id(key: str) -> str:
    """Map a source-table key (e.g. 'SAFFIRE-II') to the live catalog id ('saffire-ii')."""
    return key.lower()
