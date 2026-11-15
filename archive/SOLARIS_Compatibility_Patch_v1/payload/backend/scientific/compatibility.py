"""Source-grounded comparisons for the BASS-II experimental table.

This module NEVER estimates a flame-spread rate, a calibrated airflow speed,
or a probability that two experiments are scientifically interchangeable.
The output is a descriptive, reproducible comparison of recorded fields.
"""
from __future__ import annotations

import re
from typing import Any

METHOD_VERSION = "recorded-conditions-v1"
SOURCE_DATASET = "NASA PSI-25 / BASS-II original experimental table"


def _normal(text: str | None) -> str | None:
    if text is None:
        return None
    cleaned = " ".join(str(text).strip().split())
    return cleaned.casefold() if cleaned else None


def _reported(value: Any) -> bool:
    return value is not None and str(value).strip() != ""


def _material_family(description: str | None) -> str | None:
    """Recognize only explicit material labels; do not infer unnamed fuels."""
    if description and re.search(r"\bPMMA\b", description, flags=re.IGNORECASE):
        return "PMMA (explicitly stated)"
    return None


def _thickness_um(description: str | None) -> float | None:
    """Convert only an explicitly specified thickness from microns/mm.

    This extracts the first micron/mm number from the material description.
    The table does not separately verify this value as a measured geometry.
    """
    if not description:
        return None
    match = re.search(r"(?<![\d.])(\d+(?:\.\d+)?)\s*(microns?|micrometers?|µm|um|mm)\b", description, re.I)
    if not match:
        return None
    number = float(match.group(1))
    unit = match.group(2).lower()
    return round(number * (1000 if unit == "mm" else 1), 8)


def _width_cm(description: str | None) -> float | None:
    """Only recognize width when the source explicitly includes 'wide'."""
    if not description:
        return None
    match = re.search(r"(?<![\d.])(\d+(?:\.\d+)?)\s*cm\s+wide\b", description, re.I)
    return float(match.group(1)) if match else None


def _field(key: str, label: str, a: Any, b: Any, note: str, *, kind: str = "reported") -> dict:
    if not _reported(a) or not _reported(b):
        status = "unknown"
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
        status = "match" if a == b else "different"
    else:
        status = "match" if _normal(str(a)) == _normal(str(b)) else "different"
    return {
        "key": key,
        "label": label,
        "first_value": a if _reported(a) else None,
        "second_value": b if _reported(b) else None,
        "status": status,
        "value_kind": kind,
        "interpretation": note,
    }


def build_comparison(first: dict, second: dict) -> dict:
    """Compare two existing normalized records without inventing measurements."""
    fuel_a, fuel_b = first.get("fuel"), second.get("fuel")
    fields = [
        _field(
            "fuel_family", "Explicit material identity",
            _material_family(fuel_a), _material_family(fuel_b),
            "Only the explicitly named PMMA material is recognized; other names are not inferred.",
            kind="parsed_label",
        ),
        _field(
            "source_description", "Verbatim fuel description",
            fuel_a, fuel_b,
            "A different source description can reflect material, dimensions or preparation; it is not proof of a different chemical composition.",
        ),
        _field(
            "thickness_um", "Thickness specified in description (µm)",
            _thickness_um(fuel_a), _thickness_um(fuel_b),
            "Parsed from the text of the source material description; verify the source geometry before interpreting physical effects.",
            kind="parsed_source_text",
        ),
        _field(
            "width_cm", "Explicitly stated width (cm)",
            _width_cm(fuel_a), _width_cm(fuel_b),
            "Reported only where the words 'cm wide' appear. Unstated width is unknown, not zero.",
            kind="parsed_source_text",
        ),
        _field(
            "initial_oxygen_pct", "Initial oxygen (% by volume)",
            first.get("initial_oxygen_pct"), second.get("initial_oxygen_pct"),
            "Values are taken from the original calibrated initial O₂ column. Equality of initial O₂ alone does not establish comparable combustion conditions.",
            kind="reported_measurement",
        ),
        _field(
            "flow_restrictor", "Flow restrictor (raw setting)",
            first.get("flow_restrictor"), second.get("flow_restrictor"),
            "Instrument/configuration setting, not a calibrated flow measurement.",
            kind="instrument_setting",
        ),
        _field(
            "air_display", "Air display (raw reading)",
            first.get("air_display"), second.get("air_display"),
            "A matching display reading DOES NOT establish equal airflow speed in cm/s.",
            kind="instrument_readout",
        ),
        _field(
            "fan_display", "Fan display (raw reading)",
            first.get("fan_display"), second.get("fan_display"),
            "A matching fan display DOES NOT establish equal airflow speed or velocity profile.",
            kind="instrument_readout",
        ),
    ]

    matches = [f for f in fields if f["status"] == "match"]
    differences = [f for f in fields if f["status"] == "different"]
    unknowns = [f for f in fields if f["status"] == "unknown"]

    if differences:
        narrative = (
            f"{len(differences)} recorded/parsed field(s) differ between these tests. "
            "This comparison does not establish that differences caused any observed combustion outcome."
        )
    else:
        narrative = (
            "No differences were found among the available compared fields; "
            "this is not proof that the tests had equivalent physical conditions."
        )

    limitations = [
        "The original table does not supply a validated airflow speed in cm/s; Air display and Fan display are raw instrument fields.",
        "No flame-spread-rate measurement is included in this source table. Do not infer flame-spread behavior from metadata alone.",
        "The original table does not give a test-specific gravity acceleration or complete flow geometry; BASS-II investigation context does not replace those measurements.",
        "Fuel descriptions are unstructured and may omit composition, dimensions or other geometry. Parsed values are provisional source-text readings.",
        "A match in recorded fields is not scientific proof of experimental equivalence; a source/experimental-method review is required.",
    ]
    if unknowns:
        limitations.insert(0, f"{len(unknowns)} compared field(s) are unknown because one or both source values were not reported or could not be parsed.")
    oxygen_values = (first.get("final_oxygen_pct"), second.get("final_oxygen_pct"))
    if any(v is not None and (v < 0 or v > 100) for v in oxygen_values):
        limitations.append("A final oxygen entry is outside the physically valid percentage range and requires checking against the original source.")

    return {
        "method_version": METHOD_VERSION,
        "assessment": "source_review_required",
        "assessment_label": "Source review required",
        "summary": narrative,
        "comparison": {"matches": len(matches), "differences": len(differences), "unknown": len(unknowns)},
        "first": first,
        "second": second,
        "fields": fields,
        "evidence_passport": {
            "title": "BASS-II Recorded-Conditions Comparison",
            "source_dataset": SOURCE_DATASET,
            "source_url": first["source_url"],
            "source_locators": [first["source_locator"], second["source_locator"]],
            "record_ids": [first["id"], second["id"]],
            "evidence_type": "Descriptive source-metadata comparison",
            "status": "Review required — not a validated physical equivalence assessment",
            "unknown_fields": [f["label"] for f in unknowns],
            "limitations": limitations,
            "methodology": "Exact recorded-value comparisons and conservative parsing of explicitly stated material dimensions; no physical prediction or scoring.",
        },
    }
