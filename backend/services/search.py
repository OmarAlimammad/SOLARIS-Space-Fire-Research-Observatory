"""Transparent BM25 retrieval over SOLARIS evidence.

Corpus (each passage keeps its evidence class and source):
* published_finding   — verbatim NASA document quotes (findings.json)
* psi_record_text     — objective / hypothesis / approach / impacts text from PSI records
* publication         — publication titles + authors listed on PSI records (with DOI)
* experimental_record — one passage per BASS-II test row (source fields only)
* source_table_row    — one passage per row of the other NASA PSI experimental tables in data/raw/
                        (BASS, ACME, FLEX, FLEX-2, Saffire I-III, SAME, SAME-R, SPICE): raw cell text, never converted
* educational_note    — short SOLARIS-authored explanations (clearly labelled)

No embeddings or external services: ranking is reproducible and inspectable.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache

from ..scientific.bassii import load_original_records, material_group
from .catalog import findings, psi_snapshot

STOP = set("""a an and are as at be by for from has have how in into is it its of on or that the this to was were what when where which while who why will with does do did can could would should about than then there these those their they them not no yes vs versus between differ different difference experiment experiments involve involves involving investigate investigates investigated nasa test tests available any some me tell explain show please""".split())

EDUCATIONAL_NOTES = [
    ("edu-buoyancy", "Buoyancy and flame shape",
     "On Earth, hot combustion products are less dense than the surrounding air and rise. This buoyant flow draws fresh "
     "oxidiser toward many flames and stretches them upward. When buoyancy is weak, as in orbital free fall, transport by "
     "diffusion and by any imposed ventilation flow becomes relatively more important.",
     ["buoyancy", "microgravity", "flame-shape"]),
    ("edu-freefall", "Gravity versus free fall",
     "Gravity does not vanish in low Earth orbit: at ISS altitude it is still roughly 90 % of its surface value. "
     "Experiments appear weightless because the station and everything in it are in continuous free fall. What matters for "
     "buoyancy is the effective acceleration relative to the spacecraft, which is very small but not exactly zero.",
     ["microgravity", "gravity", "free-fall"]),
    ("edu-partial-g", "Partial gravity is a separate regime",
     "The Moon (about 1.62 m/s²) and Mars (about 3.71 m/s²) have partial gravity. Microgravity results from the ISS or "
     "Cygnus do not automatically describe partial-gravity behaviour, and none of the datasets in SOLARIS were recorded "
     "in partial gravity.",
     ["partial-gravity", "moon", "mars", "earth-transfer"]),
    ("edu-ventilation", "Why ventilation flow matters in microgravity",
     "Without buoyancy, a flame over a solid may depend on an imposed airflow to bring oxygen and remove products. Very "
     "low flow can starve or extinguish a flame; moderate flow can sustain it. NASA BASS and BASS-II studied flames in "
     "low-speed forced flows for this reason.",
     ["flow", "ventilation", "extinction"]),
    ("edu-display-fields", "Raw instrument fields in BASS-II",
     "The BASS-II table includes 'Air display', 'Fan display' and 'Flow restrictor' columns. These are raw instrument "
     "settings or readouts. The table itself does not convert them to airflow speeds in cm/s, so SOLARIS never does either.",
     ["bass-ii", "flow", "data-quality"]),
]


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9₂]+(?:-[a-z0-9]+)*", text.lower().replace("o₂", "o2"))
    out = []
    for w in words:
        if w in STOP or len(w) < 2:
            continue
        out.append(w)
        if "-" in w:
            out.extend(p for p in w.split("-") if p and p not in STOP)
    return out


@lru_cache(maxsize=1)
def corpus() -> list[dict]:
    docs: list[dict] = []
    for f in findings():
        docs.append({
            "id": f"finding:{f['id']}", "evidence_type": "published_finding",
            "title": f"{f['source']['identifier']} — {f['locator']}",
            "text": f["quote"], "investigation": f["investigation"],
            "url": f["source"]["url"], "citation": f"{f['source']['title']} ({f['source']['identifier']}), {f['locator']}",
            "tags": f["concepts"] + f["materials"],
        })
    snap = psi_snapshot()
    for inv in snap["investigations"]:
        for rec in inv["psi_records"]:
            for field, text in rec["text"].items():
                docs.append({
                    "id": f"psi:{rec['accession']}:{field}", "evidence_type": "psi_record_text",
                    "title": f"{rec['acronym'] or inv['name']} ({rec['accession']}) — {field}",
                    "text": text, "investigation": inv["id"], "url": rec["psi_url"],
                    "citation": f"NASA PSI record {rec['accession']}, '{field}' field (retrieved {snap['retrieved_utc'][:10]})",
                    "tags": [inv["name"].lower()],
                })
            for n, pub in enumerate(rec["publications"]):
                docs.append({
                    "id": f"pub:{rec['accession']}:{n}", "evidence_type": "publication",
                    "title": pub["title"], "text": f"{pub['title']}. {pub['authors']}",
                    "investigation": inv["id"],
                    "url": f"https://doi.org/{pub['doi']}" if pub["doi"] else rec["psi_url"],
                    "citation": f"{pub['authors']}. {pub['title']}." + (f" doi:{pub['doi']}" if pub["doi"] else ""),
                    "tags": [inv["name"].lower()],
                })
    for r in load_original_records():
        o2 = f"{r['initial_oxygen_pct']}%" if r["initial_oxygen_pct"] is not None else "not reported"
        docs.append({
            "id": f"record:{r['id']}", "evidence_type": "experimental_record",
            "title": f"BASS-II test {r['id']}",
            "text": f"BASS-II test {r['id']} fuel sample {r['fuel']} ({material_group(r['fuel'])}); date {r['date']}; "
                    f"initial O2 {o2}; flow restrictor {r['flow_restrictor'] or 'n/a'}; air display {r['air_display'] or 'n/a'} (raw).",
            "investigation": "bass-ii", "url": r["source_url"], "citation": r["source_locator"],
            "record_id": r["id"], "tags": ["bass-ii", material_group(r["fuel"]).split(" ")[0].lower()],
        })
    docs.extend(_source_table_passages())
    for nid, title, text, tags in EDUCATIONAL_NOTES:
        docs.append({
            "id": f"edu:{nid}", "evidence_type": "educational_note", "title": title, "text": text,
            "investigation": None, "url": None, "citation": "SOLARIS educational note (not a NASA source)", "tags": tags,
        })
    return docs


def _source_table_passages() -> list[dict]:
    """One passage per source row of every non-BASS-II PSI table (BASS-II rows are indexed above)."""
    try:
        from ..scientific.foundation import dataset, registry
    except ImportError:  # pragma: no cover
        return []
    out = []
    for meta in registry()["items"]:
        if not meta.get("available") or meta["investigation"] == "BASS-II":
            continue
        _, rows = dataset(meta["id"])
        listed = (meta.get("psi_listing") or {}).get("listed_name") or meta["file"].split("/")[-1]
        label = meta["investigation"] + (f" ({meta['variant']} flame design)" if meta["variant"] != "table" else "")
        for r in rows:
            if r["role"] == "blank":
                continue
            cells = [f"{k.strip()}: {v.strip()}" for k, v in r["values"].items() if k and v and v.strip()]
            if not cells:
                continue
            text = "; ".join(cells)
            out.append({
                "id": f"row:{meta['id']}:{r['source_row']}", "evidence_type": "source_table_row",
                "title": f"{label} table · source row {r['source_row']}" + ("" if r["role"] == "source_record" else f" ({r['role'].replace('_', ' ')})"),
                "text": f"{meta['name']} ({meta['investigation']}) experimental table row {r['source_row']}: {text}"[:900],
                "investigation": meta["site_investigation"], "url": meta["source_url"],
                "citation": f"NASA {meta['accession']} experimental table '{listed}', source row {r['source_row']} (file SHA-256 {meta['sha256'][:12]}…)",
                "dataset_id": meta["id"], "source_row": r["source_row"],
                "tags": [meta["site_investigation"], meta["topic"].lower()],
            })
    return out


@lru_cache(maxsize=1)
def _index():
    docs = corpus()
    toks = [tokenize(d["title"] + " " + d["text"] + " " + " ".join(d.get("tags", []))) for d in docs]
    df = Counter()
    for t in toks:
        df.update(set(t))
    avg = sum(len(t) for t in toks) / max(1, len(toks))
    return docs, [Counter(t) for t in toks], [len(t) for t in toks], df, avg


TYPE_WEIGHT = {"published_finding": 1.35, "psi_record_text": 1.15, "educational_note": 1.3, "publication": 0.9, "experimental_record": 0.8,
               "source_table_row": 0.7}


def search(query: str, *, limit: int = 12, types: set[str] | None = None, investigation: str | None = None) -> list[dict]:
    docs, tfs, lens, df, avg = _index()
    q = tokenize(query)
    if not q:
        return []
    n = len(docs)
    k1, b = 1.4, 0.72
    scored = []
    for i, d in enumerate(docs):
        if types and d["evidence_type"] not in types:
            continue
        if investigation and d["investigation"] != investigation:
            continue
        s = 0.0
        for term in q:
            f = tfs[i].get(term)
            if not f:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * lens[i] / avg))
        if s > 0:
            scored.append((s * TYPE_WEIGHT.get(d["evidence_type"], 1.0), i, d))
    scored.sort(key=lambda x: (-x[0], x[1]))
    out = []
    for s, i, d in scored[:limit]:
        out.append({**d, "score": round(s, 3), "matched_terms": sorted({t for t in q if tfs[i].get(t)})})
    return out
