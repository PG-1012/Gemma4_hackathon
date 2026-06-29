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
# Actions whose value is a fixed choice, not a per-run parameter.
_CONSTANT_ACTIONS = {"check", "uncheck", "click", "submit"}
_INTENT_VERB = {"fill": "Enter the", "select": "Choose the", "check": "Confirm",
                "uncheck": "Clear", "submit": "Submit", "click": "Click"}


def _slug(text: str) -> str:
    out = "".join(c if c.isalnum() else "_" for c in (text or "").lower())
    return "_".join(p for p in out.split("_") if p)


def _expected_for(action: str) -> Any:
    """What the Verifier should observe — computed locally, not from the model."""
    if action == "check":
        return "true"
    if action == "uncheck":
        return "false"
    return None


def _fallback_intent(action: str, cand: dict[str, Any]) -> str:
    """Deterministic sub_goal if the model didn't supply one."""
    if action == "submit":
        return "Submit the form"
    pretty = (cand.get("label") or cand.get("field", "").replace("_", " ")).strip().rstrip(":")
    return f"{_INTENT_VERB.get(action, 'Set the')} {pretty}".strip()


def _step_list(result: dict[str, Any]) -> list[dict[str, Any]]:
    """Pull the enrichment list out of the model response, tolerant of glitches.

    Small models occasionally mangle the wrapper key (e.g. `=steps`) — so accept
    `steps`, any list-valued key, or a bare list.
    """
    if isinstance(result, list):
        return result
    if isinstance(result.get("steps"), list):
        return result["steps"]
    for v in result.values():
        if isinstance(v, list):
            return v
    return []


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
            action = cand["action"]
            # FACTS stay local (never round-tripped through the model, so values
            # can't drift); only the INTELLIGENCE comes from the model.
            variable = bool(sem.get("variable", action not in _CONSTANT_ACTIONS))
            var_name = sem.get("var_name") or (_slug(cand["field"] or cand["label"]) if variable else "")
            steps.append(Step(
                sub_goal=sem.get("sub_goal") or _fallback_intent(action, cand),
                action=action,
                field=cand["field"],
                label=cand["label"],
                value=cand["value"],
                expected_value=_expected_for(action),
                variable=variable,
                var_name=var_name,
                selectors=cand["selectors"],
            ))
        return Workflow(name=recording.name, url=recording.url, steps=steps)

    def _enrich(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """One Gemma call: condensed candidates -> per-step semantic enrichment.

        The model only sees/returns the index + the facts it needs to reason; it
        returns `sub_goal` + variable classification keyed by index. Keeping the
        payload small and not echoing values back is what makes the single
        whole-workflow call reliable on a fast/small model.
        """
        view = [
            {"i": i, "action": c["action"], "field": c["field"],
             "label": c["label"], "type": c["type"], "value": c["value"]}
            for i, c in enumerate(candidates)
        ]
        user = (
            "Condensed candidate steps from the raw recording:\n"
            f"{json.dumps(view)}\n\n"
            "Return the semantic enrichment (sub_goal, variable, var_name) for each, "
            "keyed by index i, in order."
        )
        hint = {"role": "compiler", "candidates": view}
        result = self.llm.vision_json(COMPILER_SYSTEM, user, hint=hint)

        sems = _step_list(result)
        by_i = {s["i"]: s for s in sems if isinstance(s, dict) and "i" in s}
        # Prefer index alignment; fall back to positional if the model omitted i.
        return [by_i.get(i, sems[i] if i < len(sems) else {}) for i in range(len(candidates))]


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
