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
        """Tolerant JSON extraction — models sometimes wrap JSON in prose/fences
        or get truncated mid-string when they hit the token cap."""
        text = text.strip()
        # strip ```json ... ``` fences
        fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if fence:
            text = fence.group(1)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        start = text.find("{")
        if start == -1:
            raise json.JSONDecodeError("no object found", text, 0)
        frag = text[start:]
        # first try the largest balanced block
        end = frag.rfind("}")
        if end != -1:
            try:
                return json.loads(frag[: end + 1])
            except json.JSONDecodeError:
                pass
        # last resort: repair a truncated object (close open string + brackets).
        # The leading keys (action/index/value) survive; only a trailing
        # reasoning string is usually lost — which we don't need to act.
        repaired = LLMClient._repair_truncated(frag)
        if repaired is not None:
            return repaired
        raise json.JSONDecodeError("unrepairable JSON", text, 0)

    @staticmethod
    def _repair_truncated(s: str) -> dict[str, Any] | None:
        out: list[str] = []
        stack: list[str] = []
        in_str = False
        esc = False
        for ch in s:
            if in_str:
                out.append(ch)
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch in "{[":
                stack.append("}" if ch == "{" else "]")
            elif ch in "}]" and stack:
                stack.pop()
            out.append(ch)
        res = "".join(out)
        if in_str:
            res += '"'
        res = re.sub(r"[,\s]*$", "", res)  # drop a dangling comma
        while stack:
            res += stack.pop()
        try:
            return json.loads(res)
        except json.JSONDecodeError:
            return None
