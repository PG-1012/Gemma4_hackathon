"""Executor agent — the vision-heavy agent. Maps a sub-goal to a concrete action."""
from __future__ import annotations

import json
from typing import Any

from llm import LLMClient
from .prompts import EXECUTOR_SYSTEM


def _compact_elements(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Trim the element map to what the model needs to choose a target."""
    out = []
    for e in elements:
        item = {
            "index": e["index"],
            "tag": e["tag"],
            "type": e["type"],
            "label": e["label"],
            "value": e["value"],
        }
        if e.get("options"):
            item["options"] = e["options"]
        if e.get("checked"):
            item["checked"] = e["checked"]
        out.append(item)
    return out


class Executor:
    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def decide(
        self, sub_goal: dict[str, Any], elements: list[dict[str, Any]], screenshot: bytes
    ) -> dict[str, Any]:
        compact = _compact_elements(elements)
        user = (
            f"Sub-goal: {sub_goal.get('sub_goal')}\n"
            f"Intent: {sub_goal.get('intent')}\n"
            f"Value to enter (if any): {sub_goal.get('expected_value')}\n\n"
            f"Interactable elements on screen (numbered marks shown in the image):\n"
            f"{json.dumps(compact, indent=2)}\n\n"
            "Pick the single element that matches the sub-goal and return the action."
        )
        # `step` in the hint lets the mock client resolve the target offline.
        hint = {
            "role": "executor",
            "step": {
                "field": sub_goal.get("field"),
                "label": sub_goal.get("sub_goal"),
                "action": sub_goal.get("intent"),
                "value": sub_goal.get("expected_value"),
            },
            "elements": elements,
        }
        return self.llm.vision_json(EXECUTOR_SYSTEM, user, images=[screenshot], hint=hint)
