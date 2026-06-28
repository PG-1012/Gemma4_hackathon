"""Recovery agent — fires only when the Verifier reports failure."""
from __future__ import annotations

from typing import Any

from llm import LLMClient
from .prompts import RECOVERY_SYSTEM


class Recovery:
    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def plan(
        self,
        sub_goal: dict[str, Any],
        attempted_action: dict[str, Any],
        failure_reason: str,
        attempt: int,
    ) -> dict[str, Any]:
        user = (
            f"Failed sub-goal: {sub_goal.get('sub_goal')}\n"
            f"Attempted action: {attempted_action}\n"
            f"Failure reason: {failure_reason}\n"
            f"Attempts so far: {attempt}\n\n"
            "Choose a recovery strategy."
        )
        hint = {"role": "recovery", "attempt": attempt}
        return self.llm.vision_json(RECOVERY_SYSTEM, user, hint=hint)
