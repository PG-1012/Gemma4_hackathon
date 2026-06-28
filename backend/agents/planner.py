"""Planner agent — picks the next sub-goal. State-aware, vision-free."""
from __future__ import annotations

import json
from typing import Any

from llm import LLMClient
from workflow import Workflow, Step
from .prompts import PLANNER_SYSTEM


class Planner:
    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def next_goal(
        self, workflow: Workflow, completed: list[int], screen_summary: str
    ) -> dict[str, Any]:
        remaining = [(i, s) for i, s in enumerate(workflow.steps) if i not in completed]
        next_step: Step | None = remaining[0][1] if remaining else None

        steps_view = [
            {"idx": i, "goal": s.sub_goal, "done": i in completed}
            for i, s in enumerate(workflow.steps)
        ]
        user = (
            f"Workflow: {workflow.name}\n"
            f"Steps:\n{json.dumps(steps_view, indent=2)}\n\n"
            f"Current screen: {screen_summary}\n\n"
            "Choose the next sub-goal."
        )
        hint = {
            "role": "planner",
            "next_step": (
                {
                    "sub_goal": next_step.sub_goal,
                    "field": next_step.field,
                    "value": next_step.value,
                    "action": next_step.action,
                }
                if next_step
                else None
            ),
        }
        result = self.llm.vision_json(PLANNER_SYSTEM, user, hint=hint)
        # carry the resolved step index forward for the orchestrator
        result["_step_index"] = remaining[0][0] if remaining else None
        return result
