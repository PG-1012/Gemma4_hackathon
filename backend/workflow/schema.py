"""Workflow definition format.

A captured workflow is an ordered list of steps. Each step is an *intent*
(semantic goal) plus enough grounding to verify it. The Executor does NOT read
`field`/`value` to click blindly — it uses the screenshot + element map to find
the target. Those fields are the intent + the expected outcome the Verifier
checks against. This is what keeps the system vision-based and adaptive while
remaining testable.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Step:
    sub_goal: str                 # human-readable intent, e.g. "Enter the amount"
    action: str                   # fill | select | check | uncheck | click | submit
    field: str = ""               # DOM name/id hint for matching + verification
    label: str = ""               # visible label hint (helps fuzzy matching)
    value: Any = None             # value to enter / expected value
    expected_value: Any = None    # what the Verifier should observe (defaults to value)

    @property
    def verify_target(self) -> Any:
        return self.expected_value if self.expected_value is not None else self.value


@dataclass
class Workflow:
    name: str
    url: str
    steps: list[Step] = field(default_factory=list)

    @classmethod
    def from_json(cls, path: str | Path) -> "Workflow":
        data = json.loads(Path(path).read_text())
        return cls(
            name=data["name"],
            url=data["url"],
            steps=[Step(**s) for s in data["steps"]],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "url": self.url,
            "steps": [s.__dict__ for s in self.steps],
        }
