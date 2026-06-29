"""Recording session storage.

A recording session accumulates captured steps in memory while the Chrome
extension streams them, writing screenshots to disk as they arrive. On stop we
serialize two files into the run directory:

  recordings/<slug>-<ts>/
    workflow.json     # strictly Step/Workflow shape — the EXISTING runner reads this
    recording.json    # sidecar grounding: selectors, element maps, timing, screenshots
    screenshots/      # one PNG per step
    uploads/          # fixture files the user drops in for upload steps (see build.py)
"""
from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import build


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "workflow").lower()).strip("-")
    return s or "workflow"


def _write_screenshot(dest_dir: Path, idx: int, data_url: str) -> str:
    """Decode a data: URL (or bare base64) and write a PNG. Returns relative path."""
    b64 = data_url.split(",", 1)[1] if "," in data_url else data_url
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / f"step-{idx:02d}.png"
    path.write_bytes(base64.b64decode(b64))
    return f"screenshots/{path.name}"


@dataclass
class RecordingSession:
    run_id: str
    name: str
    url: str
    dir: Path
    viewport: dict[str, Any] = field(default_factory=dict)
    user_agent: str = ""
    started_at: str = ""
    steps: list[dict[str, Any]] = field(default_factory=list)

    @property
    def screenshots_dir(self) -> Path:
        return self.dir / "screenshots"

    @property
    def uploads_dir(self) -> Path:
        return self.dir / "uploads"


class RecordingStore:
    """In-memory registry of active recording sessions (single-user local flow)."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        self._sessions: dict[str, RecordingSession] = {}

    def start(
        self,
        name: str,
        url: str,
        viewport: dict[str, Any] | None = None,
        user_agent: str = "",
    ) -> RecordingSession:
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        run_id = f"{slugify(name)}-{ts}"
        run_dir = self.base_dir / run_id
        (run_dir / "screenshots").mkdir(parents=True, exist_ok=True)
        (run_dir / "uploads").mkdir(parents=True, exist_ok=True)
        sess = RecordingSession(
            run_id=run_id, name=name or run_id, url=url, dir=run_dir,
            viewport=viewport or {}, user_agent=user_agent, started_at=ts,
        )
        self._sessions[run_id] = sess
        return sess

    def get(self, run_id: str) -> RecordingSession | None:
        return self._sessions.get(run_id)

    def add_step(self, run_id: str, step: dict[str, Any]) -> int:
        sess = self._sessions[run_id]
        idx = len(sess.steps)
        shot = step.pop("screenshot", None)
        if shot:
            step["screenshot"] = _write_screenshot(sess.screenshots_dir, idx, shot)
        step["step_index"] = idx
        sess.steps.append(step)
        return idx

    def finish(self, run_id: str) -> dict[str, Any]:
        """Write workflow.json + recording.json and drop the session from memory."""
        sess = self._sessions.pop(run_id, None)
        if sess is None:
            raise KeyError(run_id)
        workflow, recording = build.assemble(sess)
        (sess.dir / "workflow.json").write_text(json.dumps(workflow, indent=2))
        (sess.dir / "recording.json").write_text(json.dumps(recording, indent=2))
        upload_files = [s for s in workflow["steps"] if s.get("action") == "upload"]
        return {
            "run_id": sess.run_id,
            "dir": str(sess.dir),
            "workflow_path": str(sess.dir / "workflow.json"),
            "recording_path": str(sess.dir / "recording.json"),
            "step_count": len(workflow["steps"]),
            "uploads_needed": [s.get("value") for s in upload_files],
        }
