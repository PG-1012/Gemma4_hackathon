"""Gemma intelligence demo — the COMPILE stage.

Takes a raw browser recording and shows the Gemma layer turn it into a clean,
parameterised workflow:

    python backend/compile_demo.py
    LLM_PROVIDER=cerebras python backend/compile_demo.py
    python backend/compile_demo.py --save   # write the compiled workflow JSON

It prints:
  1. how many noisy raw events condensed into how many semantic steps
  2. each step's inferred intent + variable/constant classification
  3. the exposed variables (the "rerun with new data" parameters)
  4. a receipt-extraction pass that auto-fills amount/vendor/date variables
  5. a check that the compiled workflow matches the hand-written gold workflow

Runs fully offline on the mock provider; swap LLM_PROVIDER to hit real Gemma.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:  # keep the glyphs readable on Windows' cp1252 console
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from config import settings  # noqa: E402
from llm import get_llm  # noqa: E402
from workflow import Workflow  # noqa: E402
from intelligence import (  # noqa: E402
    WorkflowCompiler, ReceiptExtractor, RawRecording,
    list_variables, bind_variables,
)
from intelligence.compiler import _condense  # noqa: E402

HERE = Path(__file__).resolve().parent
RECORDING = HERE / "workflow" / "expense_recording.json"
GOLD = HERE / "workflow" / "expense_demo.json"

C = {"head": "\033[1m", "var": "\033[38;5;44m", "const": "\033[38;5;245m",
     "ok": "\033[38;5;42m", "bad": "\033[38;5;196m", "dim": "\033[38;5;240m"}
R = "\033[0m"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--save", action="store_true", help="write compiled workflow to workflow/compiled_workflow.json")
    args = ap.parse_args()

    llm = get_llm()
    recording = RawRecording.from_json(RECORDING)
    raw_n = len(recording.events)
    condensed_n = len(_condense(recording.events))

    print(f"{C['head']}⚡ Gemma compile  ({settings.llm_provider}){R}")
    print(f"{C['dim']}recording: {recording.name}{R}")
    print(f"{C['dim']}{raw_n} raw events → {condensed_n} condensed candidates → compiling…{R}\n")

    compiler = WorkflowCompiler(llm)
    workflow = compiler.compile(recording)

    # 1) the clean semantic workflow
    print(f"{C['head']}Semantic workflow ({len(workflow.steps)} steps){R}")
    for i, s in enumerate(workflow.steps):
        if s.variable:
            tag = f"{C['var']}VAR {s.var_name}{R}"
            val = f"{C['var']}{s.value!r}{R}"
        else:
            tag = f"{C['const']}const{R}"
            val = f"{C['const']}{s.value!r}{R}" if s.value is not None else ""
        print(f"  {i:2}. {s.sub_goal:<42} {C['dim']}[{s.action}]{R} {tag} {val}")

    # 2) the exposed variables
    variables = list_variables(workflow)
    print(f"\n{C['head']}Detected variables ({len(variables)}){R} {C['dim']}— the rerun-with-new-data parameters{R}")
    print("  " + ", ".join(v["var_name"] for v in variables))

    # 3) receipt extraction → auto-fill variables.
    # Routed through the mock so the demo is deterministic without a receipt-image
    # asset; the live extractor reads a real receipt through the same interface.
    print(f"\n{C['head']}Receipt extraction{R} {C['dim']}— read the document, fill the variables "
          f"(simulated read){R}")
    from llm.mock_client import MockClient
    seeded = {"vendor": "Delta Air Lines", "date": "2026-07-02",
              "amount": "942.10", "currency": "USD", "category": "Travel"}
    extractor = ReceiptExtractor(MockClient())
    extracted = extractor.extract(b"<receipt-image-bytes>", expected=seeded)
    print(f"  read: {C['var']}{json.dumps({k: v for k, v in extracted.items() if k != 'confidence'})}{R}"
          f"  {C['dim']}(conf {extracted.get('confidence')}){R}")
    overrides = extractor.to_variables(
        extracted, {"amount": "amount", "vendor": "vendor", "date": "expense_date"})
    rebound = bind_variables(workflow, overrides)
    print(f"  {C['ok']}→ workflow re-bound:{R} amount="
          f"{_val(rebound, 'amount')}, vendor={_val(rebound, 'vendor')}, "
          f"expense_date={_val(rebound, 'expense_date')}")

    # 4) does the compiled workflow match the hand-written gold workflow?
    ok = _matches_gold(workflow)
    tag = f"{C['ok']}✓ matches gold workflow{R}" if ok else f"{C['bad']}✗ differs from gold workflow{R}"
    print(f"\n{C['head']}Fidelity check:{R} {tag} {C['dim']}(action+field+value across all steps){R}")

    if args.save:
        out = HERE / "workflow" / "compiled_workflow.json"
        out.write_text(json.dumps(workflow.to_dict(), indent=2))
        print(f"{C['dim']}saved → {out}{R}")

    return 0 if ok else 1


def _val(wf: Workflow, field: str) -> str:
    for s in wf.steps:
        if s.field == field:
            return repr(s.value)
    return "?"


def _matches_gold(compiled: Workflow) -> bool:
    gold = Workflow.from_json(GOLD)
    if len(gold.steps) != len(compiled.steps):
        return False
    for g, c in zip(gold.steps, compiled.steps):
        if (g.action, g.field, str(g.value)) != (c.action, c.field, str(c.value)):
            return False
    return True


if __name__ == "__main__":
    raise SystemExit(main())
