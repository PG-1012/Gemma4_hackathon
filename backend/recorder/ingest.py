"""FastAPI ingest endpoints for the Chrome recorder extension.

The extension streams a recording session here:
  POST /api/recordings/start  -> {run_id}
  POST /api/recordings/step   -> {step_index}   (one per captured action)
  POST /api/recordings/stop   -> {workflow_path, recording_path, ...}

Mounted by app.py. CORS (allowing the chrome-extension:// origin) is configured
there too.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import settings
from .store import RecordingStore

router = APIRouter(prefix="/api/recordings", tags=["recordings"])
store = RecordingStore(settings.recordings_dir)


class StartReq(BaseModel):
    name: str = "workflow"
    url: str = ""
    viewport: dict[str, Any] | None = None
    user_agent: str = ""


class StepReq(BaseModel):
    run_id: str
    action: str
    value: Any = None
    element: dict[str, Any] = Field(default_factory=dict)
    selectors: list[dict[str, Any]] = Field(default_factory=list)
    screenshot: str | None = None
    url: str | None = None
    title: str | None = None
    filename: str | None = None
    t_offset_ms: int | None = None


class StopReq(BaseModel):
    run_id: str


@router.get("/list")
def list_recordings() -> dict[str, Any]:
    """All saved recordings (most recent first) for the playback UI."""
    base = Path(store.base_dir)
    runs: list[dict[str, Any]] = []
    if base.exists():
        for d in sorted(base.iterdir(), reverse=True):
            wf = d / "workflow.json"
            if not (d.is_dir() and wf.exists()):
                continue
            meta = {"run_id": d.name, "name": d.name, "steps": 0,
                    "recorded_at": "", "workflow_path": str(wf),
                    "has_recording": (d / "recording.json").exists()}
            try:
                w = json.loads(wf.read_text())
                meta["name"] = w.get("name", d.name)
                meta["steps"] = len(w.get("steps", []))
                meta["url"] = w.get("url", "")
            except Exception:
                pass
            rec = d / "recording.json"
            if rec.exists():
                try:
                    meta["recorded_at"] = json.loads(rec.read_text()).get("recorded_at", "")
                except Exception:
                    pass
            runs.append(meta)
    return {"recordings": runs}


@router.post("/start")
def start(req: StartReq) -> dict[str, Any]:
    sess = store.start(req.name, req.url, req.viewport, req.user_agent)
    return {"run_id": sess.run_id, "dir": str(sess.dir)}


@router.post("/step")
def step(req: StepReq) -> dict[str, Any]:
    if store.get(req.run_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown run_id {req.run_id!r}")
    payload = req.model_dump()
    run_id = payload.pop("run_id")
    idx = store.add_step(run_id, payload)
    return {"step_index": idx}


@router.post("/stop")
def stop(req: StopReq) -> dict[str, Any]:
    try:
        return store.finish(req.run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"unknown run_id {req.run_id!r}")
