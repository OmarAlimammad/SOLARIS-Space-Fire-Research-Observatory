"""Copilot Gemini provider: offline tests (urllib is mocked; no key or network needed)."""
import io
import json
import urllib.error

from backend.services import copilot

PASSAGES = [{"id": "finding:a"}, {"id": "psi:b"}, {"id": "row:spice-table:3"}]


def test_provider_selection(monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "GEMINI_API_KEY", "GOOGLE_API_KEY", "SOLARIS_COPILOT_DISABLE_LLM"):
        monkeypatch.delenv(k, raising=False)
    assert copilot.llm_provider() is None
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    assert copilot.llm_provider() == "gemini"
    monkeypatch.setenv("SOLARIS_COPILOT_DISABLE_LLM", "1")
    assert copilot.llm_provider() is None


def test_markers_become_citations_and_invalid_numbers_are_dropped():
    blocks = copilot._split_cited("First claim [S1]. Second [S2][S9]. Both [S1, S3]. Uncited.", PASSAGES)
    assert [b["text"] for b in blocks] == ["First claim", ". Second", ". Both", ". Uncited."]
    assert [[c["passage_id"] for c in b["citations"]] for b in blocks] == [["finding:a"], ["psi:b"], ["finding:a", "row:spice-table:3"], []]


def test_markdown_is_flattened_to_plain_text():
    out = copilot._plain("**What the sources state:**\n* a [S1]\n\n**Inference:**\nInference: x\n## Heading\ny")
    assert "*" not in out and "#" not in out and out.count("Inference:") == 1 and "- a [S1]" in out


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_overloaded_model_falls_through_to_the_next(monkeypatch):
    monkeypatch.delenv("SOLARIS_COPILOT_DISABLE_LLM", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(copilot, "GEMINI_MODELS", ["busy-model", "ok-model"])
    calls = []

    def fake_urlopen(req, timeout):
        calls.append(req.full_url)
        assert req.headers["X-goog-api-key"] == "test"   # key travels in a header, never in the URL
        if "busy-model" in req.full_url:
            raise urllib.error.HTTPError(req.full_url, 503, "overloaded", {}, io.BytesIO(b"{}"))
        body = {"candidates": [{"content": {"parts": [{"text": "**Claim** [S2]."}]}, "finishReason": "STOP"}], "modelVersion": "ok-model-001"}
        return _Resp(json.dumps(body).encode())

    monkeypatch.setattr(copilot.urllib.request, "urlopen", fake_urlopen)
    out = copilot._ask_gemini("q", [{"id": f"p{i}", "evidence_type": "published_finding", "title": "t", "citation": "c", "text": "x"} for i in range(3)])
    assert len(calls) == 2 and "key=" not in calls[1]
    assert out["model"] == "ok-model-001"
    assert out["blocks"][0] == {"text": "Claim", "citations": [{"passage_id": "p1", "cited_text": ""}]}


def test_all_models_failing_falls_back_to_retrieval_mode(monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "SOLARIS_COPILOT_DISABLE_LLM"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test")

    def fail(req, timeout):
        raise TimeoutError()

    monkeypatch.setattr(copilot.urllib.request, "urlopen", fail)
    r = copilot.answer("What does BASS-II investigate?")
    assert r["mode"] == "retrieval" and r["answer"] is None and r["passages"]
    assert "could not be reached" in r["notice"]
