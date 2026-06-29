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
        # Vision is opt-in: not every Cerebras org/model has multimodal enabled.
        # When disabled we send text only — the Executor still gets the element
        # map as structured text, which is enough to choose a target.
        if settings.cerebras_vision:
            for img in images or []:
                content.append(
                    {
                        "type": "image_url",
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
            # Ceiling, not a target: a whole-workflow compile emits a large JSON
            # array, so cap high enough that the response is never truncated.
            "max_tokens": 4096,
            # Many OpenAI-compatible servers honor this; harmless if ignored.
            "response_format": {"type": "json_object"},
        }
        resp = self._client.post("/chat/completions", json=payload)
        if resp.status_code >= 400:
            self._raise_api_error(resp)
        text = resp.json()["choices"][0]["message"]["content"]
        return self._parse_json(text)

    @staticmethod
    def _raise_api_error(resp: "httpx.Response") -> None:
        """Turn a Cerebras 4xx/5xx into an actionable message instead of a raw
        httpx traceback (the bare `.raise_for_status()` hid the real cause)."""
        try:
            err = resp.json().get("error") or resp.json()
            msg = err.get("message", resp.text)
            code = err.get("code", "")
        except Exception:
            msg, code = resp.text, ""
        hints = {
            "payment_required": "Cerebras quota/billing is blocked — check the billing tab, or run with LLM_PROVIDER=mock.",
            "multimodal_not_enabled": "This Cerebras org/model has no vision — set CEREBRAS_VISION=false to run text-only.",
        }
        hint = hints.get(code, "")
        if resp.status_code == 404:
            hint = hint or f"Unknown model {settings.cerebras_model!r}. Check CEREBRAS_MODEL against GET /v1/models."
        raise RuntimeError(
            f"Cerebras API {resp.status_code} ({code or 'error'}): {msg}" + (f"\n  → {hint}" if hint else "")
        )
