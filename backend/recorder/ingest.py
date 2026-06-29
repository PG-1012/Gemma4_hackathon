"""FastAPI ingest endpoints for the Chrome recorder extension.

The extension streams a recording session here:
  POST /api/recordings/start  -> {run_id}
  POST /api/recordings/step   -> {step_index}   (one per captured action)
  POST /api/recordings/stop   -> {workflow_path, recording_path, ...}

Mounted by app.py. CORS (allowing the chrome-extension:// origin) is configured
there too.
"""
from __future__ import annotations

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
    filename: str | None = None
    t_offset_ms: int | None = None


class StopReq(BaseModel):
    run_id: str


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
