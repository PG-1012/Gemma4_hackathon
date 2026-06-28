"""Verifier agent — confirms an action achieved its intended outcome."""
from __future__ import annotations

from typing import Any

from llm import LLMClient
from .prompts import VERIFIER_SYSTEM


class Verifier:
    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def check(
        self,
        sub_goal: dict[str, Any],
        expected: Any,
        observed: Any,
        screenshot: bytes,
    ) -> dict[str, Any]:
        user = (
            f"Sub-goal: {sub_goal.get('sub_goal')}\n"
            f"Intended outcome (expected value): {expected}\n"
            f"Observed value of the target element after the action: {observed}\n\n"
            "Did the action succeed?"
        )
        hint = {"role": "verifier", "expected": expected, "observed": observed}
        return self.llm.vision_json(VERIFIER_SYSTEM, user, images=[screenshot], hint=hint)
