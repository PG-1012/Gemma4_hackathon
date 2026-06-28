"""Central configuration. Reads from environment / .env.

Cerebras specifics (exact Gemma multimodal model id, base URL, image payload
format) are intentionally left as TODOs — fill these in at kickoff once the
hackathon docs are available. Everything is keyed off LLM_PROVIDER so swapping
providers is a one-line env change.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    # Which LLM backend to use: "cerebras" | "anthropic" | "mock"
    # mock = no network, runs the full agent loop offline for plumbing tests.
    llm_provider: str = os.getenv("LLM_PROVIDER", "mock")

    # --- Cerebras (TODO: confirm at kickoff) ---
    cerebras_api_key: str = os.getenv("CEREBRAS_API_KEY", "")
    cerebras_base_url: str = os.getenv(
        "CEREBRAS_BASE_URL", "https://api.cerebras.ai/v1"
    )
    # TODO: replace with the exact Gemma multimodal model id Cerebras serves.
    cerebras_model: str = os.getenv("CEREBRAS_MODEL", "gemma-vision-TODO")

    # --- Anthropic fallback ---
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")

    # --- Browser ---
    headless: bool = _bool("HEADLESS", False)
    viewport_width: int = int(os.getenv("VIEWPORT_WIDTH", "1280"))
    viewport_height: int = int(os.getenv("VIEWPORT_HEIGHT", "900"))
    # URL of the mock form. Default points at the static file served by app.py.
    form_url: str = os.getenv("FORM_URL", "http://localhost:8000/web/expense-form.html")

    # --- Orchestration ---
    max_retries_per_step: int = int(os.getenv("MAX_RETRIES", "2"))
    # Skip the Verifier on actions that cannot fail (typing a known string into a
    # known field) to cut latency. See orchestrator for the policy.
    skip_safe_verification: bool = _bool("SKIP_SAFE_VERIFY", True)
    # Annotate screenshots with numbered set-of-marks for the vision model.
    use_set_of_marks: bool = _bool("USE_MARKS", True)


settings = Settings()
