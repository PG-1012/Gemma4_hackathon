"""Grounding — the core Gemma vision primitive.

>>> THE FIRST GOAL <<<
Give it a screenshot + a step intent (+ the element map) and it returns exactly
which element to act on, as structured JSON.

This is the single most reused capability in the system: the runner uses it to
execute each step, and the repair/replan logic uses it to re-locate a target
after the UI changes. Because it matches by *meaning* over the screenshot and
element map — never by a remembered selector — it adapts when labels move or get
renamed, which is the whole point of being vision-grounded.

It talks to the model only through `LLMClient.vision_json`, so it runs unchanged
on Cerebras/Gemma, the Anthropic fallback, or the offline mock.
"""
from __future__ import annotations

import json
from typing import Any

from llm import LLMClient
from .prompts import GROUNDER_SYSTEM


def _compact(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Trim the element map to just what the model needs to choose a target."""
    out = []
    for e in elements:
        item = {
            "index": e["index"],
            "tag": e.get("tag"),
            "type": e.get("type"),
            "label": e.get("label"),
            "value": e.get("value"),
        }
        if e.get("options"):
            item["options"] = e["options"]
        if e.get("checked"):
            item["checked"] = e["checked"]
        out.append(item)
    return out


class Grounder:
    """Resolve `intent + screenshot + elements` -> concrete action on one element."""

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def locate(
        self,
        intent: str,
        elements: list[dict[str, Any]],
        screenshot: bytes,
        *,
        value: Any = None,
        action: str | None = None,
        field: str = "",
    ) -> dict[str, Any]:
        """Return {action, index, value, target_label, confidence, reasoning}.

        `intent`  : plain-language description of the step ("Choose the department").
        `value`   : the exact value to enter, if this step carries one.
        `action`  : a hint for the expected action (fill/select/check/...); optional.
        `field`   : DOM name/id hint to disambiguate when several labels are similar.
        """
        compact = _compact(elements)
        user = (
            f"Step intent: {intent}\n"
            f"Expected action (hint): {action or 'infer from intent'}\n"
            f"Value to enter (if any): {value}\n\n"
            f"Interactable elements on screen (numbered marks shown in the image):\n"
            f"{json.dumps(compact, indent=2)}\n\n"
            "Pick the single element that fulfils the intent and return the action JSON."
        )
        # `hint` lets the mock provider resolve the target offline; real models ignore it.
        hint = {
            "role": "executor",  # same contract as the runner's executor grounding
            "step": {
                "field": field,
                "label": intent,
                "action": action or "fill",
                "value": value,
            },
            "elements": elements,
        }
        result = self.llm.vision_json(GROUNDER_SYSTEM, user, images=[screenshot], hint=hint)
        result.setdefault("confidence", 1.0 if result.get("index") is not None else 0.0)
        return result
