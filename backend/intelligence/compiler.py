"""Workflow compiler — raw recording -> clean semantic Workflow.

This is the headline Gemma capability: a human performs the task once, the
recorder dumps a noisy stream of low-level events, and the compiler turns it into
a clean, parameterised workflow the runner can replay.

Two stages:
  1. `_condense` (deterministic Python): collapse the noise — drop navigations and
     bare focus/click events, fold a burst of keystrokes into one fill, keep the
     final value per field. This is bookkeeping, not intelligence, so it's local.
  2. `_enrich`   (one Gemma call): give the model the condensed candidate steps and
     get back, per step, a semantic `sub_goal` (what the step is *for*) and a
     variable/constant classification (which inputs are per-run parameters). One
     call compiles the whole workflow — the Cerebras speed story.

The model only ever sees `LLMClient.vision_json`, so swapping mock -> cerebras is
a one-env-var change.
"""
from __future__ import annotations

import json
from typing import Any

from llm import LLMClient
from workflow import Workflow, Step
from .prompts import COMPILER_SYSTEM
from .recording import RawRecording, element_key, default_selectors

# Event types that carry no semantic step on their own.
_SKIP_EVENTS = {"navigate", "focus", "blur", "scroll", "mouseover", "mousemove", "keydown", "keyup"}
# Actions that can be folded into a preceding step on the same element.
_FOLDABLE = {"fill", "select", "check", "uncheck"}


def _map_action(ev_type: str, element: dict[str, Any], value: Any) -> str | None:
    """Map a raw event to a workflow action, or None if it carries no step."""
    tag = (element.get("tag") or "").lower()
    typ = (element.get("type") or "").lower()
    if ev_type == "input":
        return "fill"
    if ev_type == "change":
        if tag == "select" or typ.startswith("select"):
            return "select"
        if typ in {"checkbox", "radio"}:
            return "check" if value not in (False, "false", 0, None) else "uncheck"
        return "fill"
    if ev_type in {"check", "uncheck"}:
        return ev_type
    if ev_type == "upload":
        return "upload"
    if ev_type == "submit":
        return "submit"
    if ev_type == "click":
        if tag in {"button", "a"} or typ in {"submit", "button"}:
            hay = f"{element.get('id','')} {element.get('label','')}".lower()
            return "submit" if (typ == "submit" or "submit" in hay) else "click"
        if typ in {"checkbox", "radio"}:
            return "check"
        # a click that merely focuses a field before typing — dropped (folded).
        return None
    return None


def _condense(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse a noisy event stream into ordered candidate steps."""
    candidates: list[dict[str, Any]] = []
    for ev in events:
        ev_type = (ev.get("type") or "").lower()
        if ev_type in _SKIP_EVENTS:
            continue
        element = ev.get("element") or {}
        value = ev.get("value")
        action = _map_action(ev_type, element, value)
        if action is None:
            continue

        key = element_key(element)
        prev = candidates[-1] if candidates else None
        # Fold consecutive events on the same element (keystroke bursts, click+type).
        if (
            prev is not None
            and key
            and prev["_key"] == key
            and prev["action"] in _FOLDABLE
            and action in _FOLDABLE | {"click"}
        ):
            if value is not None:
                prev["value"] = value
            if action in {"select", "check", "uncheck"}:
                prev["action"] = action
            continue

        candidates.append({
            "_key": key,
            "field": element.get("name") or element.get("id") or "",
            "label": (element.get("label") or "").strip(),
            "type": element.get("type") or element.get("tag") or "",
            "options": element.get("options"),
            "selectors": default_selectors(element),
            "files": ev.get("files"),
            "action": action,
            "value": value,
        })
    return candidates


class WorkflowCompiler:
    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm

    def compile(self, recording: RawRecording) -> Workflow:
        candidates = _condense(recording.events)
        enriched = self._enrich(candidates)

        steps: list[Step] = []
        for cand, sem in zip(candidates, enriched):
            steps.append(Step(
                sub_goal=sem.get("sub_goal") or cand["label"] or cand["field"],
                action=sem.get("action") or cand["action"],
                field=sem.get("field") or cand["field"],
                label=sem.get("label") or cand["label"],
                value=sem.get("value", cand["value"]),
                expected_value=sem.get("expected_value"),
                variable=bool(sem.get("variable", False)),
                var_name=sem.get("var_name", ""),
                selectors=cand["selectors"],
            ))
        return Workflow(name=recording.name, url=recording.url, steps=steps)

    def _enrich(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """One Gemma call: condensed candidates -> semantic, parameterised steps."""
        # Strip the internal `_key` before sending.
        view = [{k: v for k, v in c.items() if k != "_key"} for c in candidates]
        user = (
            "Condensed candidate steps from the raw recording:\n"
            f"{json.dumps(view, indent=2)}\n\n"
            "Compile these into clean semantic steps. Return one step per candidate, "
            "in order, with intent sub_goals and variable/constant classification."
        )
        hint = {"role": "compiler", "candidates": view}
        result = self.llm.vision_json(COMPILER_SYSTEM, user, hint=hint)
        steps = result.get("steps", [])
        # Defensive: if the model returned the wrong count, pad/truncate to align.
        if len(steps) != len(candidates):
            steps = (steps + [{}] * len(candidates))[: len(candidates)]
        return steps


# --- variable binding helpers (used by the demo / UI "rerun with new data") ---

def list_variables(workflow: Workflow) -> list[dict[str, Any]]:
    """The parameters the compiler exposed, with their recorded default values."""
    return [
        {"var_name": s.var_name or s.field, "field": s.field,
         "label": s.label, "default": s.value, "step_index": i}
        for i, s in enumerate(workflow.steps) if s.variable
    ]


def bind_variables(workflow: Workflow, values: dict[str, Any]) -> Workflow:
    """Return a copy of the workflow with variable steps' values overridden.

    Keys in `values` may be a step's var_name or its field. Constants are
    untouched. This is what powers "run the same workflow with different data".
    """
    new_steps: list[Step] = []
    for s in workflow.steps:
        if s.variable:
            key = s.var_name or s.field
            if key in values or s.field in values:
                v = values.get(key, values.get(s.field))
                s = Step(**{**s.__dict__, "value": v,
                            "expected_value": None if s.expected_value is None else v})
        new_steps.append(s)
    return Workflow(name=workflow.name, url=workflow.url, steps=new_steps)
