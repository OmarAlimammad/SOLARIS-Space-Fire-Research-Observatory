"""Download the cached ephemeris table used by the SOLARIS flight engine from JPL Horizons.

Output: frontend/public/ephemeris/de441_2026_2032.json
States are geometric, relative to the Solar System Barycentre (500@0), ICRF axes
(REF_PLANE=FRAME), TDB time, km and km/s as returned by Horizons, stored here in m and m/s.
Run only when the cache must be regenerated; the application itself never needs the network.
"""
import hashlib, json, re, sys, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

BODIES = [('sun', '10', '2d'), ('mercury', '199', '12h'), ('venus', '299', '12h'), ('earth', '399', '12h'), ('moon', '301', '6h'),
          ('mars', '499', '1d'), ('jupiter', '5', '5d'), ('saturn', '6', '5d'), ('uranus', '7', '5d'), ('neptune', '8', '5d')]
START, STOP = '2026-01-01', '2032-01-01'
STEP_S = {'6h': 21600, '12h': 43200, '1d': 86400, '2d': 172800, '5d': 432000}
OUT = Path(__file__).resolve().parents[1] / 'frontend' / 'public' / 'ephemeris' / 'de441_2026_2032.json'
J2000_JD = 2451545.0


def fetch(cmd, step):
    q = {'format': 'text', 'COMMAND': f"'{cmd}'", 'OBJ_DATA': 'NO', 'MAKE_EPHEM': 'YES', 'EPHEM_TYPE': 'VECTORS', 'CENTER': "'500@0'",
         'START_TIME': f"'{START}'", 'STOP_TIME': f"'{STOP}'", 'STEP_SIZE': f"'{step}'", 'VEC_TABLE': '2', 'REF_PLANE': 'FRAME', 'REF_SYSTEM': 'ICRF',
         'OUT_UNITS': 'KM-S', 'CSV_FORMAT': 'YES', 'VEC_LABELS': 'NO', 'TIME_TYPE': 'TDB'}
    url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url, timeout=120) as f:
        return f.read().decode()


def main():
    out = {'format': 'solaris-ephemeris-1', 'source': 'NASA/JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api)', 'retrieved_utc': datetime.now(timezone.utc).isoformat(),
           'center': 'Solar System Barycentre (500@0)', 'frame': 'ICRF (REF_PLANE=FRAME)', 'time_scale': 'TDB', 'epoch': 'seconds past J2000.0 TDB (JD 2451545.0)',
           'units': 'm, m/s', 'start': START, 'stop': STOP, 'interpolation': 'cubic Hermite on position+velocity nodes', 'bodies': {}}
    for name, cmd, step in BODIES:
        txt = fetch(cmd, step)
        body = txt[txt.index('$$SOE') + 5:txt.index('$$EOE')]
        src = re.search(r'Target body name:\s*(.+?)\s*\{source:\s*([^}]+)\}', txt)
        rows = []
        for line in body.strip().splitlines():
            p = [x.strip() for x in line.split(',')]
            rows.append((float(p[0]), [float(x) * 1000.0 for x in p[2:8]]))
        t0 = (rows[0][0] - J2000_JD) * 86400.0
        h = STEP_S[step]
        for i, (jd, _) in enumerate(rows):
            assert abs((jd - J2000_JD) * 86400.0 - (t0 + i * h)) < 1e-3, (name, i)
        out['bodies'][name] = {'horizons_id': cmd, 'target': src.group(1) if src else name, 'horizons_source': src.group(2) if src else None, 't0': t0, 'step_s': h, 'n': len(rows),
                               'states': [float(f'{v:.12e}') for _, s in rows for v in s]}
        print(name, len(rows), src.group(2) if src else '', file=sys.stderr)
    data = json.dumps(out, separators=(',', ':'))
    OUT.write_text(data)
    print(OUT, len(data), hashlib.sha256(data.encode()).hexdigest())


if __name__ == '__main__':
    main()
