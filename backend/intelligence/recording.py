"""Raw recording format — the input to the Gemma compiler.

This is the contract the browser RECORDER (Ethan's side) produces and the
COMPILER consumes. A recording is just an ordered list of low-level events
captured while a human performed the task once. It is deliberately literal and
noisy: focus/click events, one event per keystroke burst, redundant changes. The
compiler condenses and semanticises it.

Each event is a plain dict so the recorder can attach whatever it captured
without a rigid schema. The fields the compiler looks at:

  type      : navigate | click | input | change | check | uncheck | upload | submit
  element   : { selectors: [..], name, id, tag, type, label, options? }
  value     : the value entered/selected (str | bool | null)
  files     : list of uploaded filenames (for `upload`)
  screenshot: optional base64 PNG or path captured at this event
  t         : optional timestamp in ms (for ordering / latency stories)
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class RawRecording:
    name: str
    url: str
    events: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_json(cls, path: str | Path) -> "RawRecording":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(
            name=data.get("name", "Recorded workflow"),
            url=data["url"],
            events=data.get("events", []),
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RawRecording":
        return cls(name=data.get("name", "Recorded workflow"),
                   url=data["url"], events=data.get("events", []))


def element_key(element: dict[str, Any]) -> str:
    """Stable identity for an element across events in one recording."""
    if not element:
        return ""
    sels = element.get("selectors") or []
    return (sels[0] if sels else "") or element.get("id") or element.get("name") or ""


def default_selectors(element: dict[str, Any]) -> list[str]:
    """Best-effort selector candidates when the recorder didn't supply any."""
    if element.get("selectors"):
        return list(element["selectors"])
    out: list[str] = []
    if element.get("id"):
        out.append(f"#{element['id']}")
    if element.get("name"):
        out.append(f"[name=\"{element['name']}\"]")
    return out
