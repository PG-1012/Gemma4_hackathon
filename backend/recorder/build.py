"""Derive runner-ready workflow steps from raw captured actions.

Pure functions (no LLM, no I/O) so they're easy to unit-test. They turn the raw
events streamed by the Chrome extension into:
  - workflow.json steps: strictly the 6 `Step` fields, so `Workflow.from_json`
    and every agent reads them unchanged.
  - recording.json steps: the rich sidecar (selectors, element map, timing,
    screenshots) used for grounding / debugging.

The `sub_goal` / `expected_value` here are sensible defaults; Gemma can rewrite
`sub_goal` later by editing only workflow.json.
"""
from __future__ import annotations

import re
from typing import Any

_NO_VALUE_ACTIONS = {"submit", "click"}


def humanize(s: str) -> str:
    """employee_name / employeeName / employee-name -> 'Employee Name'."""
    if not s:
        return ""
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", s)   # split camelCase
    s = re.sub(r"[_\-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s.title()


def label_for(el: dict[str, Any]) -> str:
    return (
        (el.get("label") or "").strip()
        or humanize(el.get("name") or "")
        or (el.get("placeholder") or "").strip()
        or humanize(el.get("id") or "")
        or "field"
    )


def _basename(path: str) -> str:
    return (path or "").replace("\\", "/").rstrip("/").split("/")[-1]


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "on", "checked"}


def derive_sub_goal(action: str, el: dict[str, Any], value: Any) -> str:
    lab = label_for(el)
    a = (action or "").lower()
    if a in {"fill", "type"}:
        return f"Enter the {lab}"
    if a == "select":
        return f"Choose {lab}: {value}"
    if a == "check":
        return f"Confirm {lab}"
    if a == "uncheck":
        return f"Uncheck {lab}"
    if a == "upload":
        return f"Attach {lab}"
    if a == "submit":
        # Button text usually already says "Submit ..."; don't double it up.
        return lab if lab.lower().startswith("submit") else f"Submit {lab or 'the form'}"
    if a == "click":
        return f"Click {lab}"
    return f"{a} {lab}".strip()


def _build_one(raw: dict[str, Any], step_index: int) -> tuple[dict[str, Any], dict[str, Any]]:
    el = raw.get("element") or {}
    action = (raw.get("action") or "").lower()
    value = raw.get("value")
    sub_goal = raw.get("sub_goal") or derive_sub_goal(action, el, value)
    field_hint = el.get("name") or el.get("id") or ""
    label = label_for(el)

    wf_value: Any = value
    expected: Any = value

    if action in {"check", "uncheck"}:
        checked = action == "check"
        wf_value = checked
        expected = "true" if checked else "false"
    elif action == "upload":
        filename = _basename(raw.get("filename") or value or "")
        wf_value = f"uploads/{filename}" if filename else None
        expected = filename
    elif action in _NO_VALUE_ACTIONS:
        wf_value = None
        expected = None

    # workflow.json step — only the dataclass fields
    wf_step: dict[str, Any] = {"sub_goal": sub_goal, "action": action,
                               "field": field_hint, "label": label}
    if action not in _NO_VALUE_ACTIONS:
        wf_step["value"] = wf_value
    if expected is not None and expected != wf_value:
        wf_step["expected_value"] = expected

    # recording.json step — the grounding sidecar
    rec_step: dict[str, Any] = {
        "step_index": step_index,
        "action": action,
        "sub_goal": sub_goal,
        "value": wf_value,
        "expected_value": expected,
        "element": el,
        "selectors": raw.get("selectors") or [],
        "screenshots": {"after": raw.get("screenshot")},
        "timing": {"t_offset_ms": raw.get("t_offset_ms")},
        "url": raw.get("url"),
        "page_title": raw.get("title"),
        "upload": (
            {"filename": _basename(raw.get("filename") or value or ""),
             "stored_path": wf_value}
            if action == "upload" else None
        ),
    }
    return wf_step, rec_step


def _task_summary(wf_steps: list[dict[str, Any]]) -> str:
    """A plain-English numbered recap of the workflow — a compact prose handle an
    LLM can read to grasp the whole task without parsing every step object."""
    lines = [f"{i + 1}. {s['sub_goal']}" for i, s in enumerate(wf_steps)]
    return "\n".join(lines)


def assemble(session: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (workflow_dict, recording_dict) for a RecordingSession."""
    wf_steps, rec_steps = [], []
    for raw in session.steps:
        idx = raw.get("step_index", len(wf_steps))
        wf_step, rec_step = _build_one(raw, idx)
        wf_steps.append(wf_step)
        rec_steps.append(rec_step)

    action_counts: dict[str, int] = {}
    for s in wf_steps:
        action_counts[s["action"]] = action_counts.get(s["action"], 0) + 1

    workflow = {"name": session.name, "url": session.url, "steps": wf_steps}
    recording = {
        "schema_version": 1,
        "name": session.name,
        "url": session.url,
        "viewport": session.viewport,
        "recorded_at": session.started_at,
        "user_agent": session.user_agent,
        # LLM-facing overview: read this first to understand the whole task.
        "task_summary": _task_summary(wf_steps),
        "stats": {"step_count": len(wf_steps), "action_counts": action_counts},
        "steps": rec_steps,
    }
    return workflow, recording
