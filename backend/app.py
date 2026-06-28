"""FastAPI server.

Responsibilities:
  - serve the mock form and the live agent-reasoning UI from /web
  - expose POST /api/run-config to report the active provider
  - expose WS /ws/run that runs the multi-agent loop in a worker thread and
    streams every agent event to the browser in real time

The orchestrator uses Playwright's *sync* API, which cannot share the asyncio
event loop. So we run it in a thread and marshal events back onto the loop with
`call_soon_threadsafe`.
"""
from __future__ import annotations

import asyncio
import threading
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from llm import get_llm
from browser import BrowserController
from workflow import Workflow
from agents import Orchestrator

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"
DEFAULT_WORKFLOW = Path(__file__).resolve().parent / "workflow" / "expense_demo.json"

app = FastAPI(title="Browser Speedrunner")
app.mount("/web", StaticFiles(directory=str(WEB_DIR)), name="web")


@app.get("/")
def index() -> RedirectResponse:
    return RedirectResponse("/web/index.html")


@app.get("/api/run-config")
def run_config() -> dict:
    return {"provider": settings.llm_provider, "form_url": settings.form_url}


def _run_orchestrator(workflow_path: str, base_url: str,
                      loop: asyncio.AbstractEventLoop, queue: asyncio.Queue) -> None:
    """Worker thread: drive the browser + agents, push events onto the queue."""
    def emit(event: dict) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, event)

    browser = BrowserController()
    try:
        workflow = Workflow.from_json(workflow_path)
        # Point the workflow at THIS server (port-agnostic) unless it targets an
        # external host. Keeps the demo robust regardless of which port we run on.
        if "localhost" in workflow.url or "127.0.0.1" in workflow.url:
            tail = workflow.url.split("/web/", 1)[-1]
            workflow.url = f"{base_url}/web/{tail}"
        browser.start(workflow.url)
        orch = Orchestrator(get_llm(), browser, emit=emit)
        orch.run(workflow)
    except Exception as exc:  # surface fatal errors to the UI
        emit({"type": "fatal", "error": str(exc)})
    finally:
        emit({"type": "__end__"})
        browser.stop()


@app.websocket("/ws/run")
async def ws_run(ws: WebSocket) -> None:
    await ws.accept()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    # allow the client to pass a workflow path; default to the demo workflow
    try:
        params = await asyncio.wait_for(ws.receive_json(), timeout=0.5)
    except (asyncio.TimeoutError, Exception):
        params = {}
    workflow_path = params.get("workflow", str(DEFAULT_WORKFLOW))
    host = ws.headers.get("host", "localhost:8000")
    base_url = f"http://{host}"

    worker = threading.Thread(
        target=_run_orchestrator, args=(workflow_path, base_url, loop, queue), daemon=True
    )
    worker.start()

    try:
        while True:
            event = await queue.get()
            if event.get("type") == "__end__":
                break
            await ws.send_json(event)
    except WebSocketDisconnect:
        pass
    finally:
        await ws.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
