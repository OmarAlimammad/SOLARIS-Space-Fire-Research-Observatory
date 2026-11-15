"""NASA Evidence Universe — a typed knowledge graph with provenance on every edge.

Edge semantics (each edge carries ``basis`` = where the relation comes from):

* follows_on        investigation → investigation   PSI record text / NASA release
* uses_hardware     investigation → hardware        PSI 'experimentHardware' field
* tested_material   investigation → material        BASS-II table rows (count in label)
* reports_finding   investigation → finding         the finding's source document
* about_concept     finding → concept               SOLARIS curation tag (marked curated)
* concerns_material finding → material              SOLARIS curation tag (marked curated)
* has_gap           concept/environment → gap       absence of evidence in SOLARIS (marked absence)

No edge is inferred from co-occurrence or similarity.
"""
from __future__ import annotations

from collections import Counter

from ..scientific.bassii import load_original_records, material_group
from .catalog import FOLLOW_ON, findings, investigations

HARDWARE_RULES = [
    ("hw-msg", "Microgravity Science Glovebox (MSG)", ["glovebox"]),
    ("hw-cir", "Combustion Integrated Rack (CIR)", ["combustion integrated rack"]),
    ("hw-mdca", "Multi-user Droplet Combustion Apparatus (MDCA)", ["droplet combustion"]),
    ("hw-cygnus", "Cygnus cargo vehicle", ["cygnus"]),
    ("hw-csd", "Comparative Soot Diagnostic hardware", ["soot diagnostic"]),
]

CONCEPT_LABELS = {
    "oxygen": "Oxygen concentration", "combustion-products": "Combustion products", "flow": "Imposed flow / ventilation",
    "geometry": "Sample geometry", "extinction": "Extinction", "opposed-flow": "Opposed-flow spread",
    "fuel-thickness": "Fuel thickness", "flame-spread": "Flame spread", "earth-transfer": "Earth ↔ space transfer",
    "modeling": "Modelling", "ignition": "Ignition", "flammability-limit": "Flammability limits",
    "concurrent-flow": "Concurrent-flow spread", "suppression": "Suppression", "droplet": "Droplet combustion",
    "soot": "Soot formation", "gaseous-flame": "Gaseous flames", "smoke": "Smoke particles", "detection": "Fire detection",
    "large-scale-fire": "Large-scale fire growth",
}
MATERIAL_LABELS = {"pmma": "PMMA", "sibal": "SIBAL (cotton-fiberglass)", "heptane": "n-Heptane", "methanol": "Methanol", "nomex": "Nomex"}


def build_graph() -> dict:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def node(nid, ntype, label, **extra):
        nodes.setdefault(nid, {"id": nid, "type": ntype, "label": label, **extra})

    def edge(src, dst, rel, basis, basis_kind, url=None):
        edges.append({"id": f"{src}|{rel}|{dst}", "source": src, "target": dst, "relation": rel,
                      "basis": basis, "basis_kind": basis_kind, "url": url})

    invs = investigations()
    for inv in invs:
        node(f"inv:{inv['id']}", "investigation", inv["name"], title=inv["title"], accessions=inv["accessions"],
             url=inv["psi_url"], data_level=inv["data_status"]["level"], fuel_phase=inv["profile"].get("fuel_phase"))
        hw = inv["hardware"].lower()
        for hid, label, keys in HARDWARE_RULES:
            if any(k in hw for k in keys):
                node(hid, "hardware", label)
                edge(f"inv:{inv['id']}", hid, "uses_hardware", f"PSI 'experimentHardware': {inv['hardware']}", "source_metadata", inv["psi_url"])
    for a, b, basis in FOLLOW_ON:
        edge(f"inv:{a}", f"inv:{b}", "follows_on", basis, "source_metadata")

    counts = Counter(material_group(r["fuel"]) for r in load_original_records())
    for group, n in counts.items():
        key = group.split(" ")[0].lower()
        if key in ("not", "other"):
            continue
        node(f"mat:{key}", "material", MATERIAL_LABELS.get(key, group.split(" (")[0]))
        edge("inv:bass-ii", f"mat:{key}", "tested_material", f"{n} BASS-II table row(s) name {group.split(' (')[0]} in the fuel description",
             "experimental_data", "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25")

    for f in findings():
        fid = f"find:{f['id']}"
        node(fid, "finding", f["quote"][:92] + ("…" if len(f["quote"]) > 92 else ""), quote=f["quote"],
             source=f["source"], locator=f["locator"])
        edge(f"inv:{f['investigation']}", fid, "reports_finding", f"{f['source']['identifier']} — {f['locator']}",
             "published_source", f["source"]["url"])
        for c in f["concepts"]:
            node(f"con:{c}", "concept", CONCEPT_LABELS.get(c, c))
            edge(fid, f"con:{c}", "about_concept", "SOLARIS curation tag applied to the quoted statement", "curated_tag")
        for m in f["materials"]:
            node(f"mat:{m}", "material", MATERIAL_LABELS.get(m, m))
            edge(fid, f"mat:{m}", "concerns_material", "SOLARIS curation tag: material named in the source section", "curated_tag")

    for gid, label, links in [
        ("gap:partial-gravity", "No partial-gravity evidence (Moon / Mars)", ["con:earth-transfer", "con:flame-spread"]),
        ("gap:calibrated-flow", "BASS-II rows lack calibrated flow speed", ["con:flow"]),
        ("gap:spread-rate", "BASS-II rows lack measured spread rate", ["con:flame-spread"]),
        ("gap:imports", "10 of 11 investigations have no imported rows", ["inv:acme", "inv:flex", "inv:saffire-i"]),
    ]:
        node(gid, "gap", label)
        for l in links:
            if l in nodes:
                edge(l, gid, "has_gap", "Absence of data in SOLARIS — not a scientific result", "absence")

    degree = Counter()
    for e in edges:
        degree[e["source"]] += 1
        degree[e["target"]] += 1
    for nid, n in nodes.items():
        n["degree"] = degree[nid]
    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "legend": {
            "source_metadata": "Stated in a NASA PSI record or release",
            "experimental_data": "Counted from the imported BASS-II table",
            "published_source": "Quoted from a NASA document",
            "curated_tag": "SOLARIS tagging of a quoted statement (curated, reviewable)",
            "absence": "Missing evidence in SOLARIS",
        },
    }
