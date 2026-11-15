"""Research Copilot — retrieval first, optional Claude synthesis second.

Pipeline
1. Detect explicit intents (test IDs to compare, material lookups).
2. Retrieve passages with the transparent BM25 index (search.py).
3. If ANTHROPIC_API_KEY (or another Anthropic credential) is configured and the
   ``anthropic`` package is installed, ask Claude to answer ONLY from the retrieved
   passages, passed as citable documents. Citations are mapped back to passage IDs.
4. Otherwise return "retrieval mode": the ranked evidence itself, with no generated prose.

The API key stays on the server. It is never sent to the browser.
"""
from __future__ import annotations

import os
import re

from ..scientific.bassii import load_original_records, material_group
from ..scientific.compatibility import build_comparison
from .search import search

MODEL = os.environ.get("SOLARIS_COPILOT_MODEL", "claude-opus-5-5")
MAX_PASSAGES = 10

SYSTEM_PROMPT = """You are the SOLARIS Research Copilot, a research assistant for NASA microgravity combustion evidence.

Answer using ONLY the documents provided in the user turn. Rules:
- Cite every factual sentence with the documents it comes from. If no document supports a claim, do not make it.
- Keep three things visibly separate: what the sources state, your inference from them (label it "Inference:"), and what is missing (label it "Not in the provided evidence:").
- Never invent measurements, flame-spread rates, calibrated airflow speeds, extinction thresholds, uncertainty bounds, risk percentages, papers or citations.
- In the BASS-II table, "Air display", "Fan display" and "Flow restrictor" are raw instrument fields, not airflow speeds. Never convert them.
- Two records that differ in a condition do not show that the condition caused an outcome. Say so when relevant.
- Documents marked "SOLARIS educational note" are explanatory text written by SOLARIS, not NASA sources; say so if you rely on them.
- Be concise: at most about 220 words, plain prose or short bullets."""

TEST_ID = re.compile(r"\b([BOTFMS]\d{1,3})\b", re.I)
MATERIALS = {"pmma": "PMMA (explicit)", "sibal": "SIBAL (explicit)", "nomex": "Nomex (explicit)", "wax": "Wax (explicit)"}


def _intent(question: str, selected: list[str]) -> dict:
    known = {r["id"].upper(): r for r in load_original_records()}
    ids = [m.upper() for m in TEST_ID.findall(question) if m.upper() in known]
    for s in selected:
        if s and s.upper() in known and s.upper() not in ids:
            ids.append(s.upper())
    out: dict = {"record_ids": ids[:6]}
    wants_compare = bool(re.search(r"\b(compare|differ|difference|versus|vs\.?)\b", question, re.I))
    if len(ids) >= 2 and (wants_compare or len(ids) == 2):
        out["comparison"] = build_comparison(known[ids[0]], known[ids[1]])
    q = question.lower()
    for key, group in MATERIALS.items():
        if key in q:
            rows = [r for r in load_original_records() if material_group(r["fuel"]) == group]
            o2 = sorted(r["initial_oxygen_pct"] for r in rows if r["initial_oxygen_pct"] is not None)
            out["material"] = {
                "group": group, "count": len(rows), "record_ids": [r["id"] for r in rows],
                "initial_o2_range": [o2[0], o2[-1]] if o2 else None,
                "note": "Counted from BASS-II rows whose fuel description names the material. Other investigations' rows are not imported.",
            }
            break
    return out


def _passages(question: str, intent: dict) -> list[dict]:
    hits = search(question, limit=MAX_PASSAGES + 4)
    hits = [h for h in hits if h["evidence_type"] != "experimental_record"][:MAX_PASSAGES]
    by_id = {r["id"].upper(): r for r in load_original_records()}
    for rid in intent.get("record_ids", [])[:4]:
        r = by_id[rid]
        hits.append({
            "id": f"record:{rid}", "evidence_type": "experimental_record", "title": f"BASS-II test {rid}",
            "text": (f"Test {rid}: fuel '{r['fuel']}'; date {r['date']}; initial O2 {r['initial_oxygen_pct']}% by volume; "
                     f"final O2 {r['final_oxygen_pct']}%; flow restrictor (raw) {r['flow_restrictor']}; air display (raw) {r['air_display']}; "
                     f"fan display (raw) {r['fan_display']}."),
            "investigation": "bass-ii", "url": r["source_url"], "citation": r["source_locator"], "record_id": rid, "score": None,
        })
    if "material" in intent:
        m = intent["material"]
        hits.append({
            "id": f"aggregate:{m['group']}", "evidence_type": "experimental_record", "title": f"BASS-II rows naming {m['group']}",
            "text": f"{m['count']} BASS-II rows name {m['group'].split(' (')[0]} in the fuel description. Test IDs: {', '.join(m['record_ids'])}."
                    + (f" Reported initial O2 spans {m['initial_o2_range'][0]}–{m['initial_o2_range'][1]}% by volume." if m["initial_o2_range"] else ""),
            "investigation": "bass-ii", "url": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25",
            "citation": "Computed by SOLARIS from the NASA PSI-25 table", "score": None,
        })
    return hits


def _claude_available() -> bool:
    if os.environ.get("SOLARIS_COPILOT_DISABLE_LLM"):
        return False
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def _ask_claude(question: str, passages: list[dict]) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    documents = [{
        "type": "document",
        "source": {"type": "text", "media_type": "text/plain", "data": p["text"]},
        "title": f"[{p['evidence_type']}] {p['title']}",
        "context": p["citation"],
        "citations": {"enabled": True},
    } for p in passages]
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        output_config={"effort": "low"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": documents + [{"type": "text", "text": question}]}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("The model declined this request.")
    blocks = []
    for block in response.content:
        if block.type != "text":
            continue
        cites = []
        for c in getattr(block, "citations", None) or []:
            idx = getattr(c, "document_index", None)
            if idx is not None and 0 <= idx < len(passages):
                cites.append({"passage_id": passages[idx]["id"], "cited_text": getattr(c, "cited_text", "")})
        blocks.append({"text": block.text, "citations": cites})
    return {"blocks": blocks, "model": response.model}


def answer(question: str, selected_ids: list[str] | None = None) -> dict:
    question = question.strip()
    intent = _intent(question, selected_ids or [])
    passages = _passages(question, intent)
    result = {
        "question": question,
        "intent": intent,
        "passages": passages,
        "mode": "retrieval",
        "mode_label": "Retrieval mode — ranked evidence, no generated text",
        "answer": None,
        "notice": None,
        "followups": _followups(question, intent, passages),
        "integrity": [
            "Passages are ranked by transparent keyword relevance (BM25), not by truth.",
            "Experimental records are source fields only; no flame-spread rates or calibrated flows exist in them.",
        ],
    }
    if not passages:
        result["notice"] = "No passage in the SOLARIS evidence base matches this question. This is missing evidence, not a negative answer."
        return result
    if _claude_available():
        try:
            llm = _ask_claude(question, passages)
            result.update({
                "mode": "claude_grounded",
                "mode_label": f"AI-assisted interpretation ({llm['model']}) grounded in the passages below",
                "answer": llm["blocks"],
            })
        except Exception as exc:  # network, auth, rate limit — fall back transparently
            result["notice"] = f"The AI model could not be reached ({type(exc).__name__}). Showing retrieval results only."
    else:
        result["notice"] = ("No AI model is configured on the server (set ANTHROPIC_API_KEY to enable it). "
                            "These are the most relevant passages; read them directly.")
    return result


def _followups(question: str, intent: dict, passages: list[dict]) -> list[str]:
    out = []
    if intent.get("comparison"):
        a, b = intent["comparison"]["evidence_passport"]["record_ids"]
        out.append(f"Open {a} vs {b} in the Comparison Theater")
    if intent.get("material"):
        out.append(f"Which oxygen levels are missing for {intent['material']['group'].split(' (')[0]}?")
    invs = [p["investigation"] for p in passages if p.get("investigation")]
    if invs:
        top = max(set(invs), key=invs.count)
        out.append(f"What did {top.upper()} investigate?")
    out.append("What evidence is missing for partial-gravity habitats?")
    return out[:4]
