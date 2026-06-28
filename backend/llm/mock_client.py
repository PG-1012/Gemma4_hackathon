"""Offline mock provider.

Runs the entire Planner/Executor/Verifier/Recovery loop with NO network so we
can build, wire the UI, and test the browser controller before Cerebras docs
land (Risk mitigation: "recording/integration harder than expected").

It is NOT a model — it derives correct decisions from the `hint` each agent
passes (the structured ground truth). This is deliberately a stub: swap
LLM_PROVIDER to `cerebras` (or `anthropic`) and the agents call a real vision
model with zero code changes.
"""
from __future__ import annotations

from typing import Any

from .base import LLMClient


def _match_element(step: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick the element a step refers to, by field name then fuzzy label match."""
    target = (step.get("field") or "").lower()
    label = (step.get("label") or step.get("sub_goal") or "").lower()
    # exact name/id match first
    for el in elements:
        if target and (el.get("name", "").lower() == target or el.get("id", "").lower() == target):
            return el
    # then label substring match
    for el in elements:
        el_label = el.get("label", "").lower()
        if label and el_label and (el_label in label or label in el_label):
            return el
    return None


class MockClient(LLMClient):
    name = "mock"

    def vision_json(
        self,
        system: str,
        user: str,
        images: list[bytes] | None = None,
        *,
        hint: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        hint = hint or {}
        role = hint.get("role")

        if role == "planner":
            step = hint.get("next_step")
            if step is None:
                return {"done": True, "sub_goal": "Workflow complete — all steps satisfied.",
                        "reasoning": "No remaining steps in the workflow definition."}
            return {
                "done": False,
                "sub_goal": step.get("sub_goal") or f"Set {step.get('field')} to '{step.get('value')}'",
                "field": step.get("field"),
                "intent": step.get("action", "fill"),
                "expected_value": step.get("value"),
                "reasoning": f"Next uncompleted step targets '{step.get('field')}'.",
            }

        if role == "executor":
            step = hint.get("step", {})
            elements = hint.get("elements", [])
            el = _match_element(step, elements)
            if el is None:
                return {"action": "noop", "reasoning": "No matching element found on screen."}
            return {
                "action": step.get("action", "fill"),
                "index": el["index"],
                "value": step.get("value"),
                "target_label": el.get("label"),
                "reasoning": f"Located '{el.get('label')}' (#{el['index']}) matching the sub-goal.",
            }

        if role == "verifier":
            expected = hint.get("expected")
            observed = hint.get("observed")
            ok = expected is None or str(observed).strip().lower() == str(expected).strip().lower()
            return {
                "success": ok,
                "what_changed": f"Field now reads '{observed}'.",
                "reasoning": "Observed value matches intended value."
                if ok else f"Expected '{expected}' but observed '{observed}'.",
            }

        if role == "recovery":
            attempt = hint.get("attempt", 1)
            return {
                "strategy": "retry" if attempt < 2 else "escalate",
                "reasoning": "Transient failure — retry the action." if attempt < 2
                else "Repeated failure — escalate to human.",
            }

        return {"error": f"MockClient received unknown role: {role!r}"}
