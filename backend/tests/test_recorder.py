"""Recorder + runner regression tests (no browser, no network, no pytest).

Covers the parts of Ethan's recorder/runner that DON'T need a live Chromium:
  - build.py derivation (sub_goal / expected_value / humanize / basenames)
  - store.py -> schema-conformant workflow.json (+ Workflow.from_json loads it)
  - ingest endpoints over HTTP (start/step/stop, 404s, CORS) via TestClient
  - orchestrator upload flow (path resolution + deterministic verify) via a
    fake browser controller + the mock LLM

Browser-level checks (real DOM record + Playwright replay) are documented in the
plan and must be run on a machine that can launch Chromium.

Run:  python backend/tests/test_recorder.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

# allow running from anywhere: put backend/ on the path
BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import config  # noqa: E402

_failures: list[str] = []


def check(name: str, cond: bool, extra: str = "") -> None:
    print(f"{'OK  ' if cond else 'FAIL'} {name}" + (f"  [{extra}]" if extra else ""))
    if not cond:
        _failures.append(name)


# --------------------------------------------------------------------------- #
def test_build() -> None:
    from recorder import build

    assert build.humanize("employee_name") == "Employee Name"
    assert build.humanize("employeeName") == "Employee Name"
    assert build.humanize("expense-date") == "Expense Date"
    check("humanize variants", True)

    assert build.label_for({"name": "cost_center"}) == "Cost Center"
    assert build.label_for({}) == "field"
    check("label_for fallbacks", True)

    for p, exp in [("C:\\a\\r.pdf", "r.pdf"), ("/t/b.png", "b.png"),
                   ("https://x/z.jpg", "z.jpg"), ("p.pdf", "p.pdf")]:
        assert build._basename(p) == exp, (p, build._basename(p))
    check("_basename across path styles", True)

    def raw(action, el, value=None, filename=None):
        return {"action": action, "value": value, "element": el, "filename": filename}

    wf, _ = build._build_one(raw("check", {"label": "Billable"}, value=True), 0)
    check("check -> value True / expected 'true'", wf["value"] is True and wf["expected_value"] == "true")
    wf, _ = build._build_one(raw("uncheck", {"label": "Billable"}, value=False), 0)
    check("uncheck -> value False / expected 'false'", wf["value"] is False and wf["expected_value"] == "false")
    wf, _ = build._build_one(raw("click", {"label": "Add row"}), 0)
    check("click -> no value/expected", "value" not in wf and "expected_value" not in wf)
    wf, _ = build._build_one(raw("submit", {"label": "Submit Expense Report"}), 0)
    check("submit -> no doubled 'Submit'", wf["sub_goal"] == "Submit Expense Report")
    wf, rec = build._build_one(raw("upload", {"label": "Receipt"}, value="receipt.pdf", filename="receipt.pdf"), 0)
    check("upload -> uploads/ value + filename expected",
          wf["value"] == "uploads/receipt.pdf" and wf["expected_value"] == "receipt.pdf")


# --------------------------------------------------------------------------- #
def test_store_schema() -> None:
    from recorder.store import RecordingStore
    from workflow import Workflow

    store = RecordingStore(tempfile.mkdtemp())
    sess = store.start("Acme Expense", "http://x/form", viewport={"width": 1280, "height": 900})
    store.add_step(sess.run_id, {"action": "fill", "value": "Jordan",
                                 "element": {"tag": "input", "type": "text", "name": "employee_name",
                                             "id": "employee_name", "label": "Employee Name"}})
    store.add_step(sess.run_id, {"action": "upload", "value": "receipt.pdf", "filename": "receipt.pdf",
                                 "element": {"tag": "input", "type": "file", "name": "receipt_file",
                                             "id": "receipt_file", "label": "Receipt"}})
    store.add_step(sess.run_id, {"action": "submit",
                                 "element": {"tag": "button", "type": "submit", "id": "submit-btn",
                                             "label": "Submit Expense Report"}})
    out = store.finish(sess.run_id)
    wf = json.loads(Path(out["workflow_path"]).read_text())
    check("workflow has 3 steps", len(wf["steps"]) == 3)
    check("submit step has no value", "value" not in wf["steps"][2])
    check("uploads_needed reported", out["uploads_needed"] == ["uploads/receipt.pdf"])

    w = Workflow.from_json(out["workflow_path"])  # must not raise (no extra keys leak into Step)
    check("Workflow.from_json loads recorded workflow", len(w.steps) == 3)
    rec = json.loads(Path(out["recording_path"]).read_text())
    check("recording sidecar keeps selectors slot + upload meta",
          "selectors" in rec["steps"][0] and rec["steps"][1]["upload"]["filename"] == "receipt.pdf")


# --------------------------------------------------------------------------- #
def test_ingest_http() -> None:
    config.settings.recordings_dir = tempfile.mkdtemp()
    from fastapi.testclient import TestClient
    import app
    from recorder import ingest
    ingest.store.base_dir = Path(config.settings.recordings_dir)
    c = TestClient(app.app)

    check("unknown run_id step -> 404",
          c.post("/api/recordings/step", json={"run_id": "x", "action": "fill", "element": {}}).status_code == 404)
    check("unknown run_id stop -> 404",
          c.post("/api/recordings/stop", json={"run_id": "x"}).status_code == 404)
    check("missing run_id -> 422", c.post("/api/recordings/step", json={"action": "fill"}).status_code == 422)

    origin = "chrome-extension://abcdefghijklmnop"
    r = c.post("/api/recordings/start", json={"name": "t", "url": "u"}, headers={"Origin": origin})
    check("CORS echoes extension origin", r.headers.get("access-control-allow-origin") == origin)
    r = c.options("/api/recordings/step", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"})
    check("CORS preflight ok", r.status_code == 200 and r.headers.get("access-control-allow-origin") == origin)
    r = c.post("/api/recordings/start", json={"name": "t", "url": "u"}, headers={"Origin": "https://evil.example"})
    check("CORS blocks foreign origin", r.headers.get("access-control-allow-origin") is None)


# --------------------------------------------------------------------------- #
def test_orchestrator_upload() -> None:
    config.settings.llm_provider = "mock"
    config.settings.skip_safe_verification = True
    from llm import get_llm
    from agents import Orchestrator
    from workflow import Workflow

    d = Path(tempfile.mkdtemp()) / "rec"
    (d / "uploads").mkdir(parents=True)
    (d / "uploads" / "receipt.pdf").write_text("pdf")
    (d / "workflow.json").write_text(json.dumps({"name": "t", "url": "http://x", "steps": [
        {"sub_goal": "Enter the Employee Name", "action": "fill", "field": "employee_name",
         "label": "Employee Name", "value": "Jordan"},
        {"sub_goal": "Attach Receipt", "action": "upload", "field": "receipt_file",
         "label": "Receipt", "value": "uploads/receipt.pdf", "expected_value": "receipt.pdf"},
    ]}))
    workflow = Workflow.from_json(d / "workflow.json")

    elements = [
        {"index": 0, "tag": "input", "type": "text", "name": "employee_name", "id": "employee_name",
         "label": "Employee Name", "value": "", "checked": False, "options": None, "cx": 1, "cy": 1, "box": {}},
        {"index": 1, "tag": "input", "type": "file", "name": "receipt_file", "id": "receipt_file",
         "label": "Receipt", "value": "", "checked": False, "options": None, "cx": 1, "cy": 1, "box": {}},
    ]

    class FakeBrowser:
        def __init__(self):
            self.values = {0: "", 1: ""}
            self.calls = []

        def goto(self, u): pass
        def element_map(self): return [dict(e, value=self.values[e["index"]]) for e in elements]
        def screenshot(self, marks=None): return b""
        def value_of(self, i): return self.values[i]

        def act(self, action, index, value=None):
            self.calls.append((action, index, value))
            if action in ("fill", "type"):
                self.values[index] = value
            elif action == "upload":
                assert os.path.isabs(value) and os.path.exists(value), value
                self.values[index] = os.path.basename(value)

        def stop(self): pass

    events: list[dict] = []
    b = FakeBrowser()
    result = Orchestrator(get_llm(), b, emit=events.append).run(workflow)
    check("orchestrator run success (2/2)", result["success"] and result["completed"] == 2)
    up = [c for c in b.calls if c[0] == "upload"][0]
    check("upload path resolved to absolute fixture",
          up[2] == str((d / "uploads" / "receipt.pdf").resolve()))
    v = [e for e in events if e["type"] == "verification" and e.get("step_index") == 1]
    check("upload verified deterministically (auto)",
          bool(v) and v[0]["mode"] == "auto" and v[0]["success"] and v[0]["observed"] == "receipt.pdf")


def main() -> int:
    for fn in (test_build, test_store_schema, test_ingest_http, test_orchestrator_upload):
        print(f"\n=== {fn.__name__} ===")
        fn()
    print("\n" + ("ALL TESTS PASSED" if not _failures else f"{len(_failures)} FAILED: {_failures}"))
    return 1 if _failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
