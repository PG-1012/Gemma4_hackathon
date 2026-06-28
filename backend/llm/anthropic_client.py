"""Anthropic vision fallback.

Lets the full multi-agent loop run with a real, capable vision model when
Cerebras is unavailable. Slower than Cerebras but functionally identical, which
makes it a safe demo backup (Risk: "Cerebras rate limits / quota").
"""
from __future__ import annotations

from typing import Any

from config import settings
from .base import LLMClient


class AnthropicClient(LLMClient):
    name = "anthropic"

    def __init__(self) -> None:
        try:
            import anthropic
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("`pip install anthropic` to use the Anthropic fallback.") from e
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set.")
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def vision_json(
        self,
        system: str,
        user: str,
        images: list[bytes] | None = None,
        *,
        hint: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        content: list[dict[str, Any]] = []
        for img in images or []:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": self._b64(img),
                    },
                }
            )
        content.append({"type": "text", "text": user})
        msg = self._client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            temperature=0.1,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
        text = "".join(block.text for block in msg.content if block.type == "text")
        return self._parse_json(text)
