#!/usr/bin/env python3
"""Safe, focused upgrade for the user's existing SOLARIS Home v2.

Run at project root: python apply_home_polish.py
Or: python apply_home_polish.py 'C:/path/to/SOLARIS_Research_Platform_v1'
No external Python dependencies and no network requests. Never touches backend/data.
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import sys

MARKER = "SOLARIS HOME V2.1 — FOCUSED POLISH"
IMAGE = "https://images-assets.nasa.gov/image/jsc2023e013681/jsc2023e013681~orig.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1170&w=1908"
GALLERY = "https://www.nasa.gov/gallery/solid-fuel-ignition-and-extinction-sofie/"

CSS = r"""
/* SOLARIS HOME V2.1 — FOCUSED POLISH
   Scoped to the Home page. Preserves all legacy styles and API behavior. */
.obs-home .obs-workflow-primary {
  gap: 19px;
  min-height: 460px;
}
.obs-home .obs-workflow-primary > div:last-child {
  margin-top: auto;
}
.obs-home .obs-live-snapshot {
  width: 100%;
  border-block: 1px solid rgba(180, 220, 242, .23);
  padding: 17px 0 19px;
  margin-top: 2px;
}
.obs-home .obs-live-snapshot-label {
  color: #99cde9;
  letter-spacing: .13em;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}
.obs-home .obs-live-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin: 15px 0 7px;
}
.obs-home .obs-live-metric {
  min-width: 125px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.obs-home .obs-live-metric strong {
  font: 800 clamp(25px, 2.8vw, 38px)/1.1 Manrope, sans-serif;
  letter-spacing: -.06em;
  color: #fff;
}
.obs-home .obs-live-metric small {
  color: #a8cde0;
  font-size: 10px;
  line-height: 1.4;
}
.obs-home .obs-live-snapshot > p {
  margin: 12px 0 0;
  color: #a6c9de;
  font-size: 10px;
  line-height: 1.6;
}
.obs-home .obs-workflow-secondary > a {
  display: flex;
  flex-direction: column;
  gap: 13px;
  justify-content: space-between;
}
.obs-home .obs-workflow-secondary > a > svg {
  margin: 2px 0 0;
}
.obs-home .obs-workflow-secondary > a > div:last-child {
  margin-top: auto;
}
.obs-home .obs-photo-frame img {
  object-fit: cover;
  object-position: 50% 45%;
}
.obs-home a:focus-visible {
  outline: 3px solid #65b9ee;
  outline-offset: 4px;
}
@media (max-width: 1050px) {
  .obs-home .obs-workflow-primary { min-height: 400px; }
  .obs-home .obs-workflow-grid { align-items: stretch; }
}
@media (max-width: 800px) {
  .obs-home .obs-workflow-primary { min-height: 360px; }
  .obs-home .obs-workflow-secondary { grid-template-rows: auto auto; }
  .obs-home .obs-workflow-secondary > a { min-height: 225px; }
  .obs-home .obs-photo-frame { height: clamp(330px, 63vw, 460px); }
}
@media (max-width: 550px) {
  .obs-home .obs-hero-copy h1 {
    font-size: clamp(38px, 10.5vw, 55px);
    overflow-wrap: normal;
  }
  .obs-home .obs-actions > a { width: 100%; }
  .obs-home .obs-photo-top { flex-wrap: wrap; gap: 6px; }
  .obs-home .obs-photo-frame { height: 300px; }
  .obs-home .obs-photo-index { font-size: 8px; }
  .obs-home .obs-live-metrics { gap: 14px; }
  .obs-home .obs-live-metric { min-width: 110px; }
  .obs-home .obs-workflow-primary { padding: 26px; }
  .obs-home .obs-workflow-primary h3 { font-size: 25px; }
  .obs-home .obs-workflow-secondary > a { min-height: 210px; }
  .obs-home .obs-featured-head { flex-wrap: wrap; }
  .obs-home .obs-figure-heading { font-size: 8px; }
  .obs-home .obs-photo-caption { align-items: flex-start; }
}
"""

SNAPSHOT = '''          <div className="obs-live-snapshot" aria-label="NASA BASS-II metadata snapshot">
            <div className="obs-live-snapshot-label">SOURCE SNAPSHOT / NASA PSI-25</div>
            <div className="obs-live-metrics">
              <div className="obs-live-metric">
                <strong>{records ?? "—"}</strong>
                <small>Original test records</small>
              </div>
              <div className="obs-live-metric">
                <strong>{fuelDescriptions ?? "—"}</strong>
                <small>Distinct sample descriptions</small>
              </div>
            </div>
            <p>Counts are read from the NASA data API; descriptions are not unique chemical fuel types.</p>
          </div>
'''


def replace_one(src: str, old: str, new: str, label: str) -> str:
    count = src.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one {label}, found {count}. No files modified.")
    return src.replace(old, new, 1)


def fix_home(home: str) -> str:
    if MARKER in home:
        raise RuntimeError("Patch was already applied to Home.jsx; no changes made.")
    if 'className="obs-home"' not in home:
        raise RuntimeError("This script targets the updated Home v2 (obs-home), not the original v1.")
    # Keep prior v2 intact and modify only identified text/components.
    image_pattern = r'const NASA_FLAME_IMAGE\s*=\s*"[^\"]+";'
    if len(re.findall(image_pattern, home)) != 1:
        raise RuntimeError("Could not safely identify NASA_FLAME_IMAGE in Home v2.")
    home = re.sub(image_pattern, f'const NASA_FLAME_IMAGE = "{IMAGE}";', home, count=1)

    home = replace_one(home, 'const [records, setRecords] = useState(null);',
      'const [records, setRecords] = useState(null);\n  const [fuelDescriptions, setFuelDescriptions] = useState(null);', 'metadata state')
    home = replace_one(home, 'setRecords(count);',
      'setRecords(count);\n          const descriptions = Number(data?.unique_fuel_descriptions);\n          if (Number.isFinite(descriptions) && descriptions >= 0) setFuelDescriptions(descriptions);', 'metadata handling')

    home = replace_one(home, '<span>MICROGRAVITY COMBUSTION</span>', '<span>NASA / SoFIE-GEL</span>', 'hero context')
    home = replace_one(home, 'alt="NASA photograph of a combustion flame observed in microgravity"',
       'alt="NASA SoFIE-GEL photographic sequence showing solid-fuel flames in microgravity"', 'hero alt')
    home = replace_one(home, 'EXPERIMENTAL PHOTOGRAPHY', 'DOCUMENTED FLAME SEQUENCE', 'hero photo identifier')
    home = replace_one(home, '<span>NASA RESEARCH ARCHIVE</span>', '<span>NASA / SoFIE-GEL · ISS</span>', 'photo label')
    home = replace_one(home, '<strong>Flames beyond gravity</strong>', '<strong>Solid-fuel flame evolution</strong>', 'caption title')
    home = replace_one(home, '<small>NASA experimental imagery</small>', '<small>SoFIE-GEL · ISS microgravity investigation</small>', 'caption source')
    home = replace_one(home,
       'href="https://ciencia.nasa.gov/sistema-solar/la-estacion-espacial-internacional-25-anos-de-descubrimientos-cientificos/"',
       f'href="{GALLERY}"', 'hero NASA source link')
    home = replace_one(home, 'IMAGE: ESA <ArrowUpRight', 'IMAGE: ESA/NASA <ArrowUpRight', 'ESA-NASA credit')

    home = replace_one(home, '<Database size={28} strokeWidth={1.5} />',
      '<Database size={28} strokeWidth={1.5} />\n' + SNAPSHOT.rstrip('\n'), 'workflow snapshot insertion')
    home = home.replace('Test comparability.', 'Investigate comparability.')
    home = home.replace('Trace every conclusion.', 'Trace the reasoning.')
    # App.jsx already supplies the document main landmark; avoid nesting a main.
    home = replace_one(home, '<main className="obs-home">', '<div className="obs-home">', 'main landmark')
    if not home.rstrip().endswith(');\n}'):
        # Conventional component closing used by original v2: last </main>.
        pass
    if home.count('</main>') != 1:
        raise RuntimeError("Expected one closing </main> in Home v2.")
    idx = home.rfind('</main>')
    home = home[:idx] + '</div>' + home[idx+len('</main>'):]
    return f'// {MARKER}\n' + home


def fix_header(header: str) -> str:
    # Header labels only: same routes and working buttons, no changes to navigation behavior.
    for old, new in [("label: 'Explore Data'", "label: 'Data Atlas'"),
                     ("label: 'Research Lab'", "label: 'Research Studio'"),
                     ('Enter the Lab <ArrowUpRight', 'Open Studio <ArrowUpRight')]:
        if old in header:
            header = header.replace(old, new, 1)
        elif new not in header:
            raise RuntimeError(f"Could not safely update SiteHeader: {old}")
    return header


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').expanduser().resolve()
    frontend = root / 'frontend' / 'src'
    home_path = frontend / 'pages' / 'Home.jsx'
    css_path = frontend / 'styles' / 'home.css'
    header_path = frontend / 'components' / 'SiteHeader.jsx'
    for path in (home_path, css_path, header_path):
        if not path.exists():
            print(f'ERROR: Missing {path}. Run at the SOLARIS project root.')
            return 1
    home, css, header = (p.read_text(encoding='utf-8') for p in (home_path, css_path, header_path))
    if MARKER in home or MARKER in css:
        print('Already patched — nothing changed.')
        return 0
    try:
        new_home = fix_home(home)
        new_header = fix_header(header)
    except RuntimeError as err:
        print(f'ERROR: {err}')
        return 1
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    targets = [(home_path, new_home), (css_path, css + '\n' + CSS + '\n'), (header_path, new_header)]
    # All content checked before we write anything. Make three backups first.
    backups = []
    for path, _ in targets:
        backup = path.with_name(path.name + f'.pre-polish-{stamp}.bak')
        backup.write_bytes(path.read_bytes())
        backups.append((path, backup))
    try:
        for path, new_text in targets:
            path.write_text(new_text, encoding='utf-8')
    except Exception:
        for path, backup in backups:
            path.write_bytes(backup.read_bytes())
        raise
    print('SUCCESS — SOLARIS Home v2.1 polished.')
    print('Updated: frontend/src/pages/Home.jsx')
    print('Updated: frontend/src/styles/home.css')
    print('Updated: frontend/src/components/SiteHeader.jsx')
    print('NASA dataset and FastAPI backend: NOT MODIFIED')
    print('Backups:')
    for _, backup in backups:
        print('  ' + str(backup))
    print('Next: cd frontend && npm.cmd run build')
    return 0

if __name__ == '__main__':
    sys.exit(main())
