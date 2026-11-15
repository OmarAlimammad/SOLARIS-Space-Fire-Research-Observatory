"""Research Copilot — retrieval first, optional AI synthesis (Claude or Gemini) second.

Pipeline
1. Detect explicit intents (test IDs to compare, material lookups).
2. Retrieve passages with the transparent BM25 index (search.py).
3. If ANTHROPIC_API_KEY (or another Anthropic credential) is configured and the
   ``anthropic`` package is installed, ask Claude to answer ONLY from the retrieved
   passages, passed as citable documents. Citations are mapped back to passage IDs.
   Otherwise, if GEMINI_API_KEY (or GOOGLE_API_KEY) is configured, ask Gemini the same way:
   passages are numbered [S1]..[Sn], the model must end each supported sentence with its
   markers, and only markers that point at a supplied passage are kept as citations.
4. Otherwise (or if every model call fails) return "retrieval mode": the ranked evidence
   itself, with no generated prose.

The API key stays on the server. It is never sent to the browser.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

from ..scientific.bassii import load_original_records, material_group
from ..scientific.compatibility import build_comparison
from .search import search

MODEL = os.environ.get("SOLARIS_COPILOT_MODEL", "claude-opus-5-5")
MAX_PASSAGES = 10
MAX_TABLE_ROWS = 3

SYSTEM_PROMPT = """You are the SOLARIS Research Copilot, a research assistant for NASA microgravity combustion evidence.

Answer using ONLY the documents provided in the user turn. Rules:
- Cite every factual sentence with the documents it comes from. If no document supports a claim, do not make it.
- Keep three things visibly separate: what the sources state, your inference from them (label it "Inference:"), and what is missing (label it "Not in the provided evidence:").
- Never invent measurements, flame-spread rates, calibrated airflow speeds, extinction thresholds, uncertainty bounds, risk percentages, papers or citations.
- In the BASS-II table, "Air display", "Fan display" and "Flow restrictor" are raw instrument fields, not airflow speeds. Never convert them.
- Documents of type source_table_row are raw cells of NASA PSI experimental tables. Quote units exactly as written, never convert or pool values across different investigations' tables, and do not treat a table row as an individual test unless the text says so.
- Two records that differ in a condition do not show that the condition caused an outcome. Say so when relevant.
- Documents marked "SOLARIS educational note" are explanatory text written by SOLARIS, not NASA sources; say so if you rely on them.
- Be concise: at most about 220 words, plain prose or short bullets."""

TEST_ID = re.compile(r"\b([BOTFMS]\d{1,3})\b", re.I)
MATERIALS = {"pmma": "PMMA (explicit)", "sibal": "SIBAL (explicit)", "nomex": "Nomex (explicit)", "wax": "Wax (explicit)"}


def _intent(question: str, selected: list[str]) -> dict:
    known = {r["id"].upper(): r for r in load_original_records()}
    ids = [m.upper() for m in TEST_ID.findall(question) if m.upper() in known]
    asked_ids = len(ids)
    for s in selected:
        if s and s.upper() in known and s.upper() not in ids:
            ids.append(s.upper())
    out: dict = {"record_ids": ids[:6]}
    wants_compare = bool(re.search(r"\b(compare|differ|difference|versus|vs\.?)\b", question, re.I))
    if len(ids) >= 2 and (asked_ids >= 2 or (wants_compare and asked_ids + len(selected) >= 2)):
        out["comparison"] = build_comparison(known[ids[0]], known[ids[1]])
    q = question.lower()
    for key, group in MATERIALS.items():
        if key in q:
            rows = [r for r in load_original_records() if material_group(r["fuel"]) == group]
            o2 = sorted(r["initial_oxygen_pct"] for r in rows if r["initial_oxygen_pct"] is not None)
            out["material"] = {
                "group": group, "count": len(rows), "record_ids": [r["id"] for r in rows],
                "initial_o2_range": [o2[0], o2[-1]] if o2 else None,
                "note": "Counted from BASS-II rows whose fuel description names the material. Rows from other investigations' tables are retrieved separately and never added to this count.",
            }
            break
    return out


def _passages(question: str, intent: dict) -> list[dict]:
    hits = search(question, limit=MAX_PASSAGES + 12)
    # Source-table rows from the other PSI tables are useful evidence but must not crowd out findings and PSI text.
    rows = [h for h in hits if h["evidence_type"] == "source_table_row"][:MAX_TABLE_ROWS]
    hits = [h for h in hits if h["evidence_type"] not in ("experimental_record", "source_table_row")][:MAX_PASSAGES - len(rows)] + rows
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


GEMINI_MODELS = [m.strip() for m in os.environ.get("SOLARIS_GEMINI_MODELS", "gemini-3.5-flash,gemini-3.1-flash-lite").split(",") if m.strip()]
GEMINI_TIMEOUT_S = float(os.environ.get("SOLARIS_GEMINI_TIMEOUT_S", "25"))
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_MARKERS = re.compile(r"\s*((?:\[\s*S?\d+(?:\s*[,;]\s*S?\d+)*\s*\]\s*)+)")


def _gemini_key() -> str | None:
    if os.environ.get("SOLARIS_COPILOT_DISABLE_LLM"):
        return None
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or None


def llm_provider() -> str | None:
    """Which AI provider the Copilot will use: Claude first, then Gemini, else None (retrieval only)."""
    if _claude_available():
        return "claude"
    if _gemini_key():
        return "gemini"
    return None


def _split_cited(text: str, passages: list[dict]) -> list[dict]:
    """Turn '... sentence [S1][S3]. Next ...' into blocks with citations; drop markers that point at no passage."""
    blocks, pos = [], 0
    for m in _MARKERS.finditer(text):
        nums = [int(n) for n in re.findall(r"\d+", m.group(1))]
        cites = [{"passage_id": passages[n - 1]["id"], "cited_text": ""} for n in dict.fromkeys(nums) if 1 <= n <= len(passages)]
        chunk = text[pos:m.start()]
        if chunk or cites:
            blocks.append({"text": chunk, "citations": cites})
        pos = m.end()
        if pos < len(text) and text[pos - 1] != " " and text[pos] not in ".,;:!?\n":
            blocks[-1]["text"] += " "
    if pos < len(text):
        blocks.append({"text": text[pos:], "citations": []})
    return blocks


def _plain(text: str) -> str:
    """The Copilot renders plain text: remove Markdown emphasis/headings a model may still emit."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", text)
    text = re.sub(r"(?m)^(\s*)[*•]\s+", r"\1- ", text)
    text = re.sub(r"(?m)^(Inference|Not in the provided evidence|What the sources state):\s*\n+(?=\1:)", "", text)
    return text


def _ask_gemini(question: str, passages: list[dict]) -> dict:
    key = _gemini_key()
    docs = "\n\n".join(f"[S{i}] ({p['evidence_type']}) {p['title']}\nSource: {p['citation']}\n{p['text']}" for i, p in enumerate(passages, 1))
    system = SYSTEM_PROMPT + ("\n- The documents are numbered [S1] to [S%d]. End every sentence that uses a document with its marker(s), "
                              "e.g. [S2] or [S1][S4]. Use no other citation format and never cite a number that was not given."
                              "\n- Write plain text only: no Markdown, no asterisks, no headings. Use '- ' for list items and put the labels "
                              "'Inference:' and 'Not in the provided evidence:' at the start of the relevant line, once each." % len(passages))
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": f"Documents:\n\n{docs}\n\nQuestion: {question}"}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4096},
    }
    errors = []
    for model in GEMINI_MODELS:
        req = urllib.request.Request(GEMINI_URL.format(model=model), data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "x-goog-api-key": key})
        try:
            with urllib.request.urlopen(req, timeout=GEMINI_TIMEOUT_S) as r:
                data = json.loads(r.read())
        except urllib.error.HTTPError as exc:   # 429 quota, 503 overloaded, 404 retired model: try the next one
            errors.append(f"{model}: HTTP {exc.code}")
            continue
        except (TimeoutError, OSError, ValueError) as exc:
            errors.append(f"{model}: {type(exc).__name__}")
            continue
        cand = (data.get("candidates") or [{}])[0]
        if cand.get("finishReason") in ("SAFETY", "RECITATION", "PROHIBITED_CONTENT", "BLOCKLIST"):
            raise RuntimeError("The model declined this request.")
        text = "".join(part.get("text", "") for part in cand.get("content", {}).get("parts", []) if not part.get("thought")).strip()
        if not text:
            errors.append(f"{model}: empty response")
            continue
        return {"blocks": _split_cited(_plain(text), passages), "model": data.get("modelVersion") or model}
    raise RuntimeError("; ".join(errors) or "no Gemini model configured")


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
            "Source-table rows from other PSI tables keep their original units and are never pooled with BASS-II.",
        ],
    }
    if not passages:
        result["notice"] = "No passage in the SOLARIS evidence base matches this question. This is missing evidence, not a negative answer."
        return result
    provider = llm_provider()
    if provider:
        try:
            llm = _ask_claude(question, passages) if provider == "claude" else _ask_gemini(question, passages)
            result.update({
                "mode": f"{provider}_grounded",
                "mode_label": f"AI-assisted interpretation ({llm['model']}) grounded in the passages below",
                "answer": llm["blocks"],
            })
        except Exception as exc:  # network, auth, rate limit — fall back transparently
            result["notice"] = f"The AI model could not be reached ({type(exc).__name__}). Showing retrieval results only."
    else:
        result["notice"] = ("No AI model is configured on the server (set ANTHROPIC_API_KEY or GEMINI_API_KEY to enable it). "
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
