"""LLM provider interface.

Every agent talks to the model through `LLMClient.vision_json`. The contract:
  - inputs: a system prompt, a user prompt, and zero or more images (PNG bytes)
  - output: a parsed JSON object (the agents always request structured output)

`hint` carries the structured ground truth for a turn (e.g. the workflow step).
Real providers IGNORE it — it exists only so the MockClient can simulate a
sensible decision offline. Agents build `hint` from the same data they put in
the prompt, so production and mock stay honest mirrors of each other.
"""
from __future__ import annotations

import abc
import base64
import json
import re
from typing import Any


class LLMClient(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    def vision_json(
        self,
        system: str,
        user: str,
        images: list[bytes] | None = None,
        *,
        hint: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Return a parsed JSON object from the model."""
        raise NotImplementedError

    # -- helpers shared by concrete clients --
    @staticmethod
    def _b64(image: bytes) -> str:
        return base64.b64encode(image).decode("ascii")

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        """Tolerant JSON extraction — models sometimes wrap JSON in prose/fences."""
        text = text.strip()
        # strip ```json ... ``` fences
        fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if fence:
            text = fence.group(1)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # grab the first balanced {...} block
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                return json.loads(text[start : end + 1])
            raise
