"""Gemma intelligence layer.

The compile-time and runtime intelligence that sits around the runner:

  WorkflowCompiler  raw recording      -> clean, parameterised Workflow
  Grounder          screenshot+intent  -> exact element to act on (the core primitive)
  ReceiptExtractor  document image      -> structured fields (auto-fill variables)
  SelectorRepairer  changed page        -> re-grounded targets (UI-change recovery)

Everything talks to Gemma through the shared `LLMClient.vision_json` interface,
so the same code runs on Cerebras, the Anthropic fallback, or the offline mock.
"""
from .compiler import WorkflowCompiler, list_variables, bind_variables
from .grounding import Grounder
from .extraction import ReceiptExtractor
from .repair import SelectorRepairer
from .recording import RawRecording

__all__ = [
    "WorkflowCompiler",
    "Grounder",
    "ReceiptExtractor",
    "SelectorRepairer",
    "RawRecording",
    "list_variables",
    "bind_variables",
]
