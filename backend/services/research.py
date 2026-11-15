"""Research Studio analyses that operate only on data present in SOLARIS.

* evidence_gaps()      — coverage of BASS-II records by material group × initial-O₂ bin,
                         plus investigation-level data availability and concept coverage.
* tensions()           — side-by-side statements about one concept, with their contexts,
                         and the discrepancies that the sources themselves state.
* transfer_evidence()  — statements that speak to Earth ↔ space transfer, with limits.
* what_if()            — "what was actually tested?" lookups for a changed condition.
* next_experiments()   — research-planning questions derived from coverage gaps.

None of these functions predicts a physical outcome or produces a risk score.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict

from ..scientific.bassii import load_original_records, material_group
from .catalog import findings, investigations

O2_BIN = 2.0
METHOD_VERSION = "solaris-research-v2"

# Context attributes for each published finding (from the cited source section).
FINDING_CONTEXT = {
    "bass2-stoich": {"configuration": "Multiple BASS-II geometries", "gravity": "Microgravity (ISS)", "method": "On-board gas sensors"},
    "bass2-inefficient": {"configuration": "Multiple BASS-II geometries", "gravity": "Microgravity (ISS)", "method": "On-board gas sensors"},
    "bass2-critical-velocity": {"configuration": "Opposed-flow spread over thin fuels", "gravity": "Microgravity (ISS)", "method": "Experiment + 2-D computation + scale analysis"},
    "bass2-thermal-regime": {"configuration": "Opposed-flow (µg) vs downward spread (1 g)", "gravity": "Microgravity and Earth", "method": "Experiment comparison"},
    "bass-thickness-spread": {"configuration": "Narrow-channel / BASS flame spread", "gravity": "Microgravity (ISS)", "method": "Experiment"},
    "bass-model-gap": {"configuration": "Narrow-channel / BASS flame spread", "gravity": "Microgravity (ISS)", "method": "Model vs experiment"},
    "bass2-rod-ignition": {"configuration": "Concurrent flow past PMMA rods", "gravity": "Microgravity (ISS)", "method": "Experiment"},
    "bass-sibal-quench": {"configuration": "Concurrent flow over cotton-fiberglass fabric", "gravity": "Microgravity (ISS)", "method": "Experiment"},
    "bass-sibal-theory": {"configuration": "Concurrent flow over cotton-fiberglass fabric", "gravity": "Microgravity (ISS)", "method": "Experiment vs earlier theory"},
    "flex-limit-lower": {"configuration": "Droplet combustion with inert diluents", "gravity": "Microgravity (ISS)", "method": "Experiment"},
    "flex-suppressant-margin": {"configuration": "Droplet combustion with inert diluents", "gravity": "Microgravity (ISS)", "method": "Interpretation in source"},
    "spice-2009": {"configuration": "Gas-jet diffusion flames", "gravity": "Microgravity (ISS)", "method": "Experiment description"},
    "same-particles": {"configuration": "Smoke from heated materials", "gravity": "Microgravity (ISS)", "method": "Experiment description"},
    "saffire1-conducted": {"configuration": "Large-scale fabric burn", "gravity": "Microgravity (Cygnus)", "method": "Mission report"},
    "saffire-phase1": {"configuration": "Large-scale burns", "gravity": "Microgravity (Cygnus)", "method": "Mission report"},
    "saffire-1-2-complete": {"configuration": "Large-scale burns", "gravity": "Microgravity (Cygnus)", "method": "Mission report"},
}

# Discrepancies that the cited source states explicitly. SOLARIS does not invent others.
SOURCE_STATED_DISCREPANCIES = [
    {
        "id": "model-vs-experiment-spread",
        "finding_ids": ["bass-model-gap"],
        "kind": "model_vs_experiment",
        "label": "Model over-predicts measured spread rate",
        "explanation": "The source reports that its model predicts much higher spread rates than the experiment. This is a "
                       "model–data discrepancy stated by the authors, not a contradiction between two experiments.",
    },
    {
        "id": "ignition-vs-flammability",
        "finding_ids": ["bass2-rod-ignition"],
        "kind": "limit_definitions_differ",
        "label": "Ignition limit ≠ flammability limit",
        "explanation": "The source reports ignition limits at higher O₂ than flammability limits. Treating the two limits as "
                       "interchangeable would create an apparent contradiction that is really a definitional difference.",
    },
]


def _o2_bin(v):
    if v is None or not (0 <= v <= 100):
        return None
    return math.floor(v / O2_BIN) * O2_BIN


def evidence_gaps() -> dict:
    recs = load_original_records()
    groups = Counter(material_group(r["fuel"]) for r in recs)
    bins = sorted({b for b in (_o2_bin(r["initial_oxygen_pct"]) for r in recs) if b is not None})
    matrix = defaultdict(lambda: defaultdict(list))
    unknown_o2 = Counter()
    for r in recs:
        b = _o2_bin(r["initial_oxygen_pct"])
        g = material_group(r["fuel"])
        if b is None:
            unknown_o2[g] += 1
        else:
            matrix[g][b].append(r["id"])
    material_rows = [g for g, _ in groups.most_common()]
    cells = []
    for g in material_rows:
        for b in bins:
            ids = matrix[g][b]
            cells.append({"material_group": g, "o2_bin_start": b, "o2_bin_end": b + O2_BIN, "count": len(ids), "record_ids": ids})
    concepts = Counter(c for f in findings() for c in f["concepts"])
    invs = investigations()
    return {
        "method_version": METHOD_VERSION,
        "dataset": "NASA PSI-25 / BASS-II original experimental table",
        "o2_bins": [{"start": b, "end": b + O2_BIN} for b in bins],
        "material_groups": [{"group": g, "count": groups[g], "unknown_o2": unknown_o2[g]} for g in material_rows],
        "cells": cells,
        "investigation_availability": [
            {"id": i["id"], "name": i["name"], "level": i["data_status"]["level"], "imported_rows": i["data_status"]["imported_rows"],
             "findings": len(i["finding_ids"]), "publications": i["publication_count"], "fuel_phase": i["profile"].get("fuel_phase")}
            for i in invs
        ],
        "concept_coverage": [{"concept": c, "findings": n} for c, n in concepts.most_common()],
        "environment_coverage": [
            {"environment": "Microgravity — ISS", "status": "evidence_present", "basis": "BASS, BASS-II, ACME, FLEX, FLEX-2, SAME, SAME-R, SPICE operated on the ISS"},
            {"environment": "Microgravity — Cygnus (uncrewed)", "status": "evidence_present", "basis": "Saffire I–III"},
            {"environment": "Lunar partial gravity (~0.17 g)", "status": "no_evidence_in_solaris", "basis": "No dataset or finding in SOLARIS was recorded in partial gravity"},
            {"environment": "Martian partial gravity (~0.38 g)", "status": "no_evidence_in_solaris", "basis": "No dataset or finding in SOLARIS was recorded in partial gravity"},
        ],
        "limitations": [
            "Counts describe how many BASS-II table rows exist for each combination; they are not evidence strength.",
            "Material groups use only names written in the fuel description. 'Other descriptions' includes rods whose material is not named.",
            "An empty cell means no row in this table, not that the condition is safe, unsafe or untested elsewhere.",
            "Other investigations' tables (now browsable in the Data Atlas) use different fields, units and hardware, so they are never used to fill BASS-II cells.",
        ],
    }


def tensions(concept: str) -> dict:
    items = [f for f in findings() if concept in f["concepts"]]
    statements = [{**f, "context": FINDING_CONTEXT.get(f["id"], {})} for f in items]
    dims = ["configuration", "gravity", "method"]
    differing = [d for d in dims if len({s["context"].get(d) for s in statements}) > 1]
    discrepancies = [d for d in SOURCE_STATED_DISCREPANCIES if any(fid in {s["id"] for s in statements} for fid in d["finding_ids"])]
    if len(statements) < 2:
        verdict = "insufficient_statements"
        verdict_label = "Fewer than two statements — nothing to compare."
    elif discrepancies:
        verdict = "source_stated_discrepancy"
        verdict_label = "The sources themselves state a discrepancy (see below). No experiment-vs-experiment contradiction was detected."
    else:
        verdict = "no_contradiction_detected"
        verdict_label = "No source-supported contradiction detected. Statements differ in context, which must be read before comparing them."
    return {
        "method_version": METHOD_VERSION,
        "concept": concept,
        "statements": statements,
        "context_dimensions_that_differ": differing,
        "source_stated_discrepancies": discrepancies,
        "verdict": verdict,
        "verdict_label": verdict_label,
        "method": "Statements tagged with the same concept are aligned by configuration, gravity condition and method. "
                  "SOLARIS flags a contradiction only when a source states it; otherwise differing contexts are reported, "
                  "because different conditions are not contradictory results.",
        "available_concepts": sorted({c for f in findings() for c in f["concepts"]}),
    }


def transfer_evidence() -> dict:
    items = [{**f, "context": FINDING_CONTEXT.get(f["id"], {})} for f in findings() if "earth-transfer" in f["concepts"]]
    return {
        "method_version": METHOD_VERSION,
        "statements": items,
        "questions": [
            {"question": "Does an Earth flammability screening test bound behaviour in microgravity?",
             "evidence_ids": ["bass2-rod-ignition", "flex-limit-lower", "flex-suppressant-margin"],
             "reading": "These sources report differences between Earth-based standards or limits and microgravity observations. "
                        "They do not provide a general conversion between the two."},
            {"question": "Can some Earth configurations reproduce microgravity spread behaviour?",
             "evidence_ids": ["bass2-thermal-regime"],
             "reading": "For thin PMMA in the thermal regime, the source reports agreement between downward spread on Earth and "
                        "microgravity data. The statement is specific to that configuration."},
        ],
        "limitations": [
            "Qualitative reading of published statements; not an engineering safety assessment.",
            "Findings are specific to the fuels, geometries, flows and oxygen levels that were tested.",
            "No SOLARIS evidence covers lunar or martian partial gravity.",
        ],
    }


def what_if(base_id: str, change: str, value: str | None = None) -> dict:
    by_id = {r["id"].casefold(): r for r in load_original_records()}
    base = by_id.get(base_id.strip().casefold())
    if not base:
        return {"error": "Base record not found"}
    group = material_group(base["fuel"])
    recs = load_original_records()
    matches = []
    description = ""
    if change == "oxygen":
        target = float(value) if value not in (None, "") else None
        if target is None:
            return {"error": "Provide a target initial O₂ (% by volume)."}
        description = f"Same explicit material group ({group}), initial O₂ within ±1.0 point of {target:g}%"
        matches = [r for r in recs if r["id"] != base["id"] and material_group(r["fuel"]) == group
                   and r["initial_oxygen_pct"] is not None and abs(r["initial_oxygen_pct"] - target) <= 1.0]
    elif change == "material":
        description = f"Different material group ({value}), initial O₂ within ±1.0 point of the base record"
        o2 = base["initial_oxygen_pct"]
        matches = [r for r in recs if material_group(r["fuel"]) == value and o2 is not None
                   and r["initial_oxygen_pct"] is not None and abs(r["initial_oxygen_pct"] - o2) <= 1.0]
    elif change == "flow_setting":
        description = f"Same explicit material group ({group}), different raw flow-restrictor setting ({value})"
        matches = [r for r in recs if r["id"] != base["id"] and material_group(r["fuel"]) == group and r["flow_restrictor"] == (value or "")]
    else:
        return {"error": "Unsupported change. Use oxygen, material or flow_setting."}
    return {
        "method_version": METHOD_VERSION,
        "mode": "observational_lookup",
        "base": base,
        "change": change,
        "value": value,
        "criteria": description,
        "matches": matches,
        "interpretation": (
            f"{len(matches)} BASS-II record(s) were actually run under the changed condition. "
            "These records can be inspected and compared, but SOLARIS does not predict what the base experiment "
            "would have done under the change. Other fields (geometry, flow, date, operator) may also differ."
            if matches else
            "No BASS-II record matches the changed condition. This is an evidence gap in this table, not a prediction."
        ),
    }


def next_experiments() -> dict:
    gaps = evidence_gaps()
    by_group = defaultdict(dict)
    for c in gaps["cells"]:
        by_group[c["material_group"]][c["o2_bin_start"]] = c["count"]
    ideas = []
    for g, row in by_group.items():
        if g in ("Not reported", "Other descriptions"):
            continue
        populated = [b for b, n in row.items() if n > 0]
        if not populated:
            continue
        lo, hi = min(populated), max(populated)
        holes = [b for b, n in sorted(row.items()) if n == 0 and lo < b < hi]
        if holes:
            ideas.append({
                "kind": "interior_oxygen_gap",
                "material_group": g,
                "question": f"How do {g.split(' (')[0]} samples behave between {holes[0]:g}% and {holes[-1] + O2_BIN:g}% initial O₂?",
                "rationale": f"BASS-II has {g} records at {lo:g}–{hi + O2_BIN:g}% initial O₂ but none in {len(holes)} interior "
                             f"{O2_BIN:g}-point bin(s). Filling them would show whether behaviour changes smoothly across the range.",
                "evidence": {"populated_bins": populated, "empty_interior_bins": holes},
            })
        sparse = [b for b, n in row.items() if n == 1]
        if sparse:
            ideas.append({
                "kind": "single_replicate",
                "material_group": g,
                "question": f"Are the single {g.split(' (')[0]} runs at {', '.join(f'{b:g}%' for b in sorted(sparse))} reproducible?",
                "rationale": f"{len(sparse)} oxygen bin(s) contain only one {g} record. A repeat test would indicate run-to-run variability.",
                "evidence": {"single_record_bins": sorted(sparse)},
            })
    ideas.append({
        "kind": "environment_gap",
        "material_group": None,
        "question": "How do the same materials behave in lunar or martian partial gravity?",
        "rationale": "SOLARIS contains microgravity and Earth-referenced statements only. Partial gravity is a distinct buoyancy regime with no evidence here.",
        "evidence": {"environments_without_evidence": ["Lunar partial gravity", "Martian partial gravity"]},
    })
    ideas.append({
        "kind": "measurement_gap",
        "material_group": None,
        "question": "Which BASS-II rows can be linked to calibrated flow speeds and measured spread rates?",
        "rationale": "The imported table holds raw flow settings and no spread rate. Linking rows to the PI reports' calibrated values would make quantitative comparison possible.",
        "evidence": {"missing_quantities": ["calibrated flow velocity (cm/s)", "flame spread rate"]},
    })
    return {
        "method_version": METHOD_VERSION,
        "ideas": ideas,
        "disclaimer": "Research-planning prompts derived from gaps in the data held by SOLARIS. They are hypotheses to discuss, "
                      "not predictions, and they ignore cost, hardware and safety constraints.",
    }
