"""Cerebras-hosted Gemma vision client.

Cerebras exposes an OpenAI-compatible chat-completions endpoint. The structure
below follows that convention. TWO things must be confirmed at kickoff and are
marked TODO:
  1. the exact multimodal model id (config.cerebras_model)
  2. the image content-part format the served model expects

If Cerebras' Gemma build uses the standard OpenAI `image_url` data-URI format,
the code below works unchanged once the model id is set.
"""
from __future__ import annotations

from typing import Any

import httpx

from config import settings
from .base import LLMClient


class CerebrasClient(LLMClient):
    name = "cerebras"

    def __init__(self) -> None:
        if not settings.cerebras_api_key:
            raise RuntimeError(
                "CEREBRAS_API_KEY is not set. Set it in .env or use LLM_PROVIDER=mock."
            )
        self._client = httpx.Client(
            base_url=settings.cerebras_base_url,
            headers={"Authorization": f"Bearer {settings.cerebras_api_key}"},
            timeout=60.0,
        )

    def vision_json(
        self,
        system: str,
        user: str,
        images: list[bytes] | None = None,
        *,
        hint: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        content: list[dict[str, Any]] = [{"type": "text", "text": user}]
        for img in images or []:
            content.append(
                {
                    "type": "image_url",
                    # TODO: confirm Cerebras accepts data-URI image_url for Gemma.
                    "image_url": {"url": f"data:image/png;base64,{self._b64(img)}"},
                }
            )
        payload = {
            "model": settings.cerebras_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            "temperature": 0.1,
            "max_tokens": 1024,
            # Many OpenAI-compatible servers honor this; harmless if ignored.
            "response_format": {"type": "json_object"},
        }
        resp = self._client.post("/chat/completions", json=payload)
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        return self._parse_json(text)
