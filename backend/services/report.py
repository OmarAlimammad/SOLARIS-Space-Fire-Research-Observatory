"""One-Click Scientific Report — a reproducible PDF built only from data held by SOLARIS."""
from __future__ import annotations

import hashlib
import io
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

from ..scientific.bassii import DATA_PATH, load_original_records, material_group
from ..scientific.compatibility import METHOD_VERSION as COMPAT_VERSION, build_comparison
from .catalog import findings, investigation, psi_snapshot

NAVY = colors.HexColor("#0b2c47")
BLUE = colors.HexColor("#1679c2")
PALE = colors.HexColor("#eef6fc")
STROKE = colors.HexColor("#d9e7f1")
MUTED = colors.HexColor("#5d7286")
REPORT_VERSION = "solaris-report-v1"

_styles = getSampleStyleSheet()
S = {
    "title": ParagraphStyle("t", parent=_styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=NAVY, alignment=TA_LEFT, spaceAfter=4),
    "kicker": ParagraphStyle("k", fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=BLUE, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=NAVY, spaceBefore=12, spaceAfter=6),
    "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=NAVY, spaceBefore=8, spaceAfter=3),
    "body": ParagraphStyle("b", fontName="Helvetica", fontSize=9, leading=13, textColor=colors.HexColor("#22394d")),
    "small": ParagraphStyle("s", fontName="Helvetica", fontSize=7.5, leading=10, textColor=MUTED),
    "quote": ParagraphStyle("q", fontName="Helvetica-Oblique", fontSize=8.8, leading=12.5, textColor=colors.HexColor("#22394d"), leftIndent=8, borderPadding=4),
    "cell": ParagraphStyle("c", fontName="Helvetica", fontSize=7.8, leading=10),
    "cellb": ParagraphStyle("cb", fontName="Helvetica-Bold", fontSize=7.8, leading=10, textColor=NAVY),
}


def P(text, style="body"):
    return Paragraph(escape(str(text)).replace("₂", "<sub>2</sub>"), S[style])


def _label(kind: str) -> str:
    return {
        "reported_measurement": "Measured (source)", "instrument_setting": "Instrument setting (raw)",
        "instrument_readout": "Instrument readout (raw)", "parsed_label": "Parsed from text",
        "parsed_source_text": "Parsed from text", "reported": "Experimental metadata",
    }.get(kind, kind)


def _table(rows, widths, header=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.4, STROKE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), PALE)]
    t.setStyle(TableStyle(style))
    return t


def _material_chart(records):
    counts = {}
    for r in records:
        g = material_group(r["fuel"])
        counts[g] = counts.get(g, 0) + 1
    items = sorted(counts.items(), key=lambda x: x[1])
    d = Drawing(170 * mm, 14 * len(items) + 44)
    c = HorizontalBarChart()
    c.x, c.y = 42 * mm, 32
    c.height, c.width = 14 * len(items), 110 * mm
    c.data = [[v for _, v in items]]
    c.categoryAxis.categoryNames = [k for k, _ in items]
    c.categoryAxis.labels.fontName = "Helvetica"
    c.categoryAxis.labels.fontSize = 7
    c.categoryAxis.labels.dx = -4
    c.categoryAxis.labels.boxAnchor = "e"
    c.valueAxis.valueMin = 0
    c.valueAxis.labels.fontSize = 7
    c.bars[0].fillColor = BLUE
    c.bars[0].strokeColor = None
    c.barLabelFormat = "%d"
    c.barLabels.fontSize = 7
    c.barLabels.nudge = 7
    d.add(c)
    d.add(String(0, 2, "Rows per explicit material group in the BASS-II table (counts, not evidence strength).", fontSize=6.8, fillColor=MUTED))
    return d


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 6.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "SOLARIS — Space Fire Research Observatory · Independent student research project · NASA is a data source, not an endorser.")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(BLUE)
    canvas.setLineWidth(1.2)
    canvas.line(18 * mm, A4[1] - 12 * mm, 40 * mm, A4[1] - 12 * mm)
    canvas.restoreState()


def build_report(question: str, record_ids: list[str], investigation_id: str = "bass-ii",
                 include_findings: bool = True, notes: str = "") -> tuple[bytes, dict]:
    records = load_original_records()
    by_id = {r["id"].upper(): r for r in records}
    chosen = [by_id[i.upper()] for i in record_ids if i and i.upper() in by_id]
    unknown = [i for i in record_ids if i and i.upper() not in by_id]
    inv = investigation(investigation_id) or investigation("bass-ii")
    generated = datetime.now(timezone.utc)
    csv_hash = hashlib.sha256(DATA_PATH.read_bytes()).hexdigest()
    snap = psi_snapshot()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title="SOLARIS Scientific Report", author="SOLARIS Research Platform")
    story = [
        P("SOLARIS · SPACE FIRE RESEARCH OBSERVATORY · SCIENTIFIC REPORT", "kicker"),
        P(question or "Recorded-conditions report", "title"),
        P(f"Generated {generated.strftime('%Y-%m-%d %H:%M UTC')} · Report method {REPORT_VERSION} · Comparison method {COMPAT_VERSION}", "small"),
        Spacer(1, 8),
    ]

    story += [P("1. Evidence classes used in this report", "h2"),
              _table([[P("Label", "cellb"), P("Meaning", "cellb")],
                      [P("Measured (source)", "cell"), P("Value from a calibrated measurement column of the NASA table.", "cell")],
                      [P("Experimental metadata", "cell"), P("Descriptive source field (IDs, dates, free-text descriptions).", "cell")],
                      [P("Instrument setting / readout (raw)", "cell"), P("Device fields kept as written. Not converted to physical units.", "cell")],
                      [P("Published finding", "cell"), P("Verbatim quotation from a NASA document, with locator.", "cell")],
                      [P("SOLARIS interpretation", "cell"), P("Descriptive comparison produced by SOLARIS code. Not a physical prediction.", "cell")]],
                     [52 * mm, 122 * mm])]

    story += [P("2. Investigation", "h2"),
              _table([[P("Field", "cellb"), P("Value", "cellb")],
                      [P("Investigation", "cell"), P(f"{inv['name']} — {inv['title']}", "cell")],
                      [P("PSI accession(s)", "cell"), P(", ".join(inv["accessions"]), "cell")],
                      [P("DOI", "cell"), P(inv["doi"] or "Not listed", "cell")],
                      [P("Hardware", "cell"), P(inv["hardware"] or "Not listed", "cell")],
                      [P("Data in SOLARIS", "cell"), P(f"{inv['data_status']['label']} — {inv['data_status']['note']}", "cell")],
                      [P("PSI record", "cell"), P(inv["psi_url"], "cell")]],
                     [40 * mm, 134 * mm])]
    if inv.get("summary"):
        story += [Spacer(1, 4), P(f"Objective (quoted from {inv['summary_source']}):", "small"), P(inv["summary"], "quote")]

    story += [P("3. Selected experiments", "h2")]
    if chosen:
        rows = [[P(h, "cellb") for h in ["Test", "Fuel sample (verbatim)", "Date", "Initial O₂ %", "Final O₂ %", "Flow restr. (raw)", "Air disp. (raw)"]]]
        for r in chosen:
            rows.append([P(x, "cell") for x in [r["id"], r["fuel"] or "Not reported", r["date"] or "—",
                                                 "—" if r["initial_oxygen_pct"] is None else r["initial_oxygen_pct"],
                                                 "—" if r["final_oxygen_pct"] is None else r["final_oxygen_pct"],
                                                 r["flow_restrictor"] or "—", r["air_display"] or "—"]])
        story.append(_table(rows, [14 * mm, 52 * mm, 20 * mm, 20 * mm, 20 * mm, 24 * mm, 24 * mm]))
    else:
        story.append(P("No BASS-II experiments were selected. Sections that depend on records are omitted.", "small"))
    if unknown:
        story.append(P(f"Ignored unknown IDs: {', '.join(unknown)}", "small"))

    comparison = None
    if len(chosen) >= 2:
        comparison = build_comparison(chosen[0], chosen[1])
        story += [P(f"4. Recorded-conditions comparison — {chosen[0]['id']} vs {chosen[1]['id']}", "h2"),
                  P(f"SOLARIS interpretation: {comparison['summary']}", "body"), Spacer(1, 4)]
        rows = [[P(h, "cellb") for h in ["Field", "Evidence class", chosen[0]["id"], chosen[1]["id"], "Status"]]]
        for f in comparison["fields"]:
            rows.append([P(f["label"], "cell"), P(_label(f["value_kind"]), "cell"),
                         P("Not reported" if f["first_value"] is None else f["first_value"], "cell"),
                         P("Not reported" if f["second_value"] is None else f["second_value"], "cell"),
                         P(f["status"], "cell")])
        story.append(_table(rows, [46 * mm, 34 * mm, 34 * mm, 34 * mm, 26 * mm]))
        story.append(Spacer(1, 4))
        story.append(P(f"Tally: {comparison['comparison']['matches']} match · {comparison['comparison']['differences']} differ · "
                       f"{comparison['comparison']['unknown']} unknown. Matching raw readings do not establish equal airflow.", "small"))

    story += [KeepTogether([P("5. Dataset overview (computed from the table)", "h2"), _material_chart(records),
                            P(f"{len(records)} rows · {sum(r['initial_oxygen_pct'] is not None for r in records)} with initial O₂ reported.", "small")])]

    if include_findings:
        inv_findings = [f for f in findings() if f["investigation"] == inv["id"]] or findings()[:4]
        story += [P("6. Published findings (verbatim)", "h2")]
        for f in inv_findings[:8]:
            story += [P(f"“{f['quote']}”", "quote"), P(f"{f['source']['title']} ({f['source']['identifier']}), {f['locator']}. {f['source']['url']}", "small"), Spacer(1, 4)]

    if notes.strip():
        story += [P("7. Researcher notes (user-supplied, not verified)", "h2"), P(notes.strip()[:3000], "body")]

    story += [PageBreak(), P("Evidence Passport", "h2")]
    passport_rows = [[P("Item", "cellb"), P("Value", "cellb")],
                     [P("Source dataset", "cell"), P("NASA PSI-25 / BASS-II original experimental table (unchanged copy)", "cell")],
                     [P("File", "cell"), P(f"data/raw/bassii_nasa_original.csv · SHA-256 {csv_hash}", "cell")],
                     [P("Record IDs", "cell"), P(", ".join(r["id"] for r in chosen) or "None", "cell")],
                     [P("Source locators", "cell"), P("; ".join(r["source_locator"] for r in chosen) or "—", "cell")],
                     [P("Catalog snapshot", "cell"), P(f"NASA PSI public metadata retrieved {snap['retrieved_utc']}", "cell")],
                     [P("Methods", "cell"), P("Exact comparison of recorded fields; explicit-text parsing of thickness and width; counts. No physical model, no scoring.", "cell")]]
    if comparison:
        passport_rows.append([P("Unknown fields", "cell"), P(", ".join(comparison["evidence_passport"]["unknown_fields"]) or "None", "cell")])
    story.append(_table(passport_rows, [40 * mm, 134 * mm]))
    story += [P("Limitations", "h3")]
    limits = (comparison["evidence_passport"]["limitations"] if comparison else []) + [
        "This report covers BASS-II rows only. SOLARIS also holds the other PSI experimental tables, but their fields and units differ and they are not pooled here.",
        "Published findings are excerpts. Read them in their source documents before drawing conclusions.",
        "This report is not a fire-safety certification, risk assessment or validated engineering analysis.",
    ]
    for l in limits:
        story.append(P(f"• {l}", "body"))
    story += [P("Sources", "h3"),
              P("NASA PSI-25 (BASS-II): https://psi.nasa.gov/physci/repo/data/investigations/PSI-25", "small"),
              P("BASS-II Summary Report, NASA/TM-20210011385: https://ntrs.nasa.gov/citations/20210011385", "small"),
              P(f"{inv['name']} PSI record: {inv['psi_url']}", "small")]

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    meta = {"generated_utc": generated.isoformat(timespec="seconds"), "records": [r["id"] for r in chosen],
            "investigation": inv["id"], "csv_sha256": csv_hash, "report_version": REPORT_VERSION}
    return buf.getvalue(), meta
