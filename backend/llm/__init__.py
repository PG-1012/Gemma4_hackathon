"""LLM provider factory. Selects the backend from config.llm_provider."""
from __future__ import annotations

from config import settings
from .base import LLMClient


def get_llm() -> LLMClient:
    provider = settings.llm_provider.lower()
    if provider == "cerebras":
        from .cerebras_client import CerebrasClient
        return CerebrasClient()
    if provider == "anthropic":
        from .anthropic_client import AnthropicClient
        return AnthropicClient()
    if provider == "mock":
        from .mock_client import MockClient
        return MockClient()
    raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider!r}")


__all__ = ["LLMClient", "get_llm"]
