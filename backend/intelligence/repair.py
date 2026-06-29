"""Selector repair & replan — resilience when the page changes.

Recorded selectors are brittle: rename a field, move it into a new section, swap
an id, and a classic selector-based RPA bot breaks. This module is the recovery
story.

  - `resolve`  : cheap, deterministic — do any of the step's recorded selectors /
                 field hints still match an element on the current page?
  - `repair`   : if not, re-ground the step by MEANING against the current element
                 map (Gemma vision). Returns the replacement target. This is the
                 "UI changed → Gemma recovering" moment in the demo.
  - `replan`   : repair every step against a changed page in one pass, yielding a
                 fresh index map the runner can replay — used when version B of
                 the site differs structurally from what was recorded.
"""
from __future__ import annotations

from typing import Any

from llm import LLMClient
from workflow import Workflow, Step
from .grounding import Grounder


def _norm(s: str) -> str:
    return (s or "").strip().lower()


class SelectorRepairer:
    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm
        self.grounder = Grounder(llm)

    def resolve(self, step: Step, elements: list[dict[str, Any]]) -> dict[str, Any] | None:
        """Return the still-matching element for `step`, or None if selectors broke.

        Matches on DOM name/id (what the recorder saved) — the fast path that
        needs no model call when the page is unchanged.
        """
        field = _norm(step.field)
        for el in elements:
            if field and (_norm(el.get("name", "")) == field or _norm(el.get("id", "")) == field):
                return el
        # selectors saved as #id / [name="..."] — match their core token too
        tokens = {_strip_selector(s) for s in step.selectors}
        tokens.discard("")
        for el in elements:
            if _norm(el.get("name", "")) in tokens or _norm(el.get("id", "")) in tokens:
                return el
        return None

    def repair(
        self, step: Step, elements: list[dict[str, Any]], screenshot: bytes
    ) -> dict[str, Any]:
        """Re-locate a step's target after its selectors broke.

        Returns {repaired, index, target_label, confidence, reasoning}. `repaired`
        is False when the selectors still resolved (no model call was needed) and
        True when Gemma re-grounded the step by meaning.
        """
        still = self.resolve(step, elements)
        if still is not None:
            return {"repaired": False, "index": still["index"],
                    "target_label": still.get("label"), "confidence": 1.0,
                    "reasoning": "Recorded selector still resolves on the page."}

        decision = self.grounder.locate(
            step.sub_goal, elements, screenshot,
            value=step.value, action=step.action, field=step.field,
        )
        idx = decision.get("index")
        return {
            "repaired": True,
            "index": idx,
            "target_label": decision.get("target_label"),
            "confidence": decision.get("confidence", 0.0),
            "reasoning": decision.get("reasoning", "Re-grounded by meaning after selector break."),
            "found": idx is not None,
        }

    def replan(
        self, workflow: Workflow, elements: list[dict[str, Any]], screenshot: bytes
    ) -> list[dict[str, Any]]:
        """Repair every step against a changed page; one entry per step."""
        out = []
        for i, step in enumerate(workflow.steps):
            r = self.repair(step, elements, screenshot)
            out.append({"step_index": i, "sub_goal": step.sub_goal, **r})
        return out


def _strip_selector(sel: str) -> str:
    """Pull the identifying token out of a simple selector (#id / [name="x"])."""
    sel = (sel or "").strip()
    if sel.startswith("#"):
        return _norm(sel[1:])
    if sel.startswith('[name='):
        return _norm(sel[6:].strip('"]\'[name= '))
    return ""
