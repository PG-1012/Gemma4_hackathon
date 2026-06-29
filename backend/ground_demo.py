"""Gemma intelligence demo — the GROUND stage (the first goal).

>>> Give it a screenshot + a step intent, get back exactly which element to
    click, as structured JSON. <<<

    python backend/ground_demo.py                       # offline, static fixture
    python backend/ground_demo.py "Pick the approving manager" --value "Sarah Chen"
    python backend/ground_demo.py --live                 # real browser screenshot
    LLM_PROVIDER=cerebras python backend/ground_demo.py --live

Offline mode feeds a static element map + a blank image so the contract is
demonstrable with no browser. `--live` drives the real form through Playwright
and grounds against an actual screenshot + live element map.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:  # keep the box-drawing/glyphs readable on Windows' cp1252 console
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from config import settings  # noqa: E402
from llm import get_llm  # noqa: E402
from intelligence import Grounder  # noqa: E402

# A static element map that mirrors the expense form — lets the grounding
# contract run with no browser. (Real runs use BrowserController.element_map().)
STATIC_ELEMENTS = [
    {"index": 0, "tag": "input", "type": "text", "name": "employee_name", "id": "employee_name", "label": "Employee Name", "value": ""},
    {"index": 1, "tag": "input", "type": "text", "name": "employee_id", "id": "employee_id", "label": "Employee ID", "value": ""},
    {"index": 2, "tag": "input", "type": "email", "name": "email", "id": "email", "label": "Work Email", "value": ""},
    {"index": 3, "tag": "select", "type": "select-one", "name": "department", "id": "department", "label": "Department", "value": "", "options": ["Engineering", "Sales", "Marketing", "Finance"]},
    {"index": 4, "tag": "select", "type": "select-one", "name": "category", "id": "category", "label": "Expense Category", "value": "", "options": ["Travel", "Meals", "Lodging", "Software"]},
    {"index": 5, "tag": "input", "type": "number", "name": "amount", "id": "amount", "label": "Amount", "value": ""},
    {"index": 6, "tag": "select", "type": "select-one", "name": "manager", "id": "manager", "label": "Approving Manager", "value": "", "options": ["Sarah Chen", "David Kim", "Maria Lopez"]},
    {"index": 7, "tag": "input", "type": "checkbox", "name": "terms", "id": "terms", "label": "I certify these expenses comply with company policy", "value": "", "checked": False},
    {"index": 8, "tag": "button", "type": "submit", "name": "", "id": "submit-btn", "label": "Submit Expense Report", "value": ""},
]
# Minimal valid 1x1 PNG, so the vision call has an image to carry.
BLANK_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def live_inputs(intent: str):
    from browser import BrowserController
    browser = BrowserController()
    browser.start()
    try:
        elements = browser.element_map()
        marks = [e["index"] for e in elements]
        shot = browser.screenshot(marks)
        return elements, shot, browser
    except Exception:
        browser.stop()
        raise


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("intent", nargs="?", default="Choose the department",
                    help="the step intent to ground")
    ap.add_argument("--value", default="Engineering", help="value to enter, if the step has one")
    ap.add_argument("--action", default=None, help="expected action hint (fill/select/check/...)")
    ap.add_argument("--live", action="store_true", help="ground against the real browser form")
    args = ap.parse_args()

    grounder = Grounder(get_llm())
    browser = None
    if args.live:
        elements, shot, browser = live_inputs(args.intent)
        source = "live browser screenshot"
    else:
        elements, shot, source = STATIC_ELEMENTS, BLANK_PNG, "static fixture"

    try:
        print(f"\033[1m⚡ Gemma ground  ({settings.llm_provider}, {source})\033[0m")
        print(f"\033[38;5;240melements on screen: {len(elements)}\033[0m")
        print(f"\033[38;5;44mintent:\033[0m {args.intent!r}   "
              f"\033[38;5;44mvalue:\033[0m {args.value!r}\n")

        decision = grounder.locate(
            args.intent, elements, shot, value=args.value, action=args.action)

        print("\033[1mGemma decision (structured JSON):\033[0m")
        print(json.dumps(decision, indent=2))

        idx = decision.get("index")
        if idx is not None:
            print(f"\n\033[38;5;42m✓ resolved to element #{idx} "
                  f"({decision.get('target_label')!r}) → {decision.get('action')}\033[0m")
            return 0
        print("\n\033[38;5;196m✗ no element matched the intent\033[0m")
        return 1
    finally:
        if browser is not None:
            browser.stop()


if __name__ == "__main__":
    raise SystemExit(main())
