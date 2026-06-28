"""Split-screen demo runner (Track 2 video).

Opens two browser windows side by side against the same mock form:
  - LEFT  : a plain window for a human teammate to fill out manually
  - RIGHT : the AI, driving the multi-agent loop in a visible window

Both are positioned automatically. The script waits for you to press Enter so
the human and AI start simultaneously — that's the synchronized start the demo
video needs ("AI finishes while human is on field 4").

    python backend/split_screen.py

Tip: record the whole screen; the agent console (web/index.html) can be opened
in a third window if you want the reasoning panel on camera too.
"""
from __future__ import annotations

import functools
import http.server
import socketserver
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from playwright.sync_api import sync_playwright  # noqa: E402
from config import settings  # noqa: E402
from llm import get_llm  # noqa: E402
from browser import BrowserController  # noqa: E402
from workflow import Workflow  # noqa: E402
from agents import Orchestrator  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = Path(__file__).resolve().parent / "workflow" / "expense_demo.json"
PORT = 8099
W, H = 720, 940  # per-window size


def serve() -> socketserver.TCPServer:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main() -> None:
    httpd = serve()
    url = f"http://127.0.0.1:{PORT}/web/expense-form.html"

    # LEFT: human window (separate Playwright instance, no automation)
    pw_human = sync_playwright().start()
    human = pw_human.chromium.launch(
        headless=False,
        args=[f"--window-position=0,0", f"--window-size={W},{H}"],
    )
    human_page = human.new_context(no_viewport=True).new_page()
    human_page.goto(url)

    # RIGHT: AI window, positioned to the right
    settings.headless = False  # ensure visible
    ai = BrowserController()
    # monkeypatch launch args via env-free override: start then reposition
    pw_ai = sync_playwright().start()
    ai_browser = pw_ai.chromium.launch(
        headless=False,
        args=[f"--window-position={W+8},0", f"--window-size={W},{H}"],
    )
    ai.page = ai_browser.new_context(no_viewport=True).new_page()
    ai._pw, ai._browser = pw_ai, ai_browser
    ai.goto(url)

    workflow = Workflow.from_json(WORKFLOW)
    workflow.url = url

    print("\n  LEFT = human   |   RIGHT = AI")
    input("  Press Enter to START BOTH simultaneously…")
    t0 = time.perf_counter()

    def emit(ev: dict) -> None:
        if ev.get("type") == "step_complete":
            dt = time.perf_counter() - t0
            print(f"  [AI {dt:4.1f}s] {ev['completed']}/{ev['total']}  {ev['sub_goal']}")
        elif ev.get("type") == "run_complete":
            print(f"\n  AI FINISHED in {ev['elapsed_ms']/1000:.1f}s "
                  f"({ev['completed']}/{ev['total']} steps)")

    Orchestrator(get_llm(), ai, emit=emit).run(workflow)

    input("\n  Press Enter to close both windows…")
    ai.stop()
    human.close()
    pw_human.stop()
    httpd.shutdown()


if __name__ == "__main__":
    main()
