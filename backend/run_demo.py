"""Standalone CLI runner — no web server, no UI.

Serves the repo over a throwaway HTTP server, drives the full multi-agent loop
against the demo workflow, and prints every agent event to the terminal. This is
the tool for the "test the exact workflow 20+ times" risk mitigation:

    python backend/run_demo.py            # mock provider (offline)
    LLM_PROVIDER=cerebras python backend/run_demo.py
    python backend/run_demo.py --loops 20 # stress-test reliability

Exit code is non-zero if any run fails, so it doubles as a smoke test.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

# allow running as `python backend/run_demo.py`
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import settings  # noqa: E402
from llm import get_llm  # noqa: E402
from browser import BrowserController  # noqa: E402
from workflow import Workflow  # noqa: E402
from agents import Orchestrator  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = Path(__file__).resolve().parent / "workflow" / "expense_demo.json"

COLORS = {
    "planner": "\033[38;5;99m", "executor": "\033[38;5;44m",
    "verifier": "\033[38;5;42m", "recovery": "\033[38;5;214m",
    "system": "\033[38;5;245m",
}
RESET = "\033[0m"


def serve_root(port: int) -> socketserver.TCPServer:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def make_emit():
    def emit(ev: dict) -> None:
        t = ev.get("type")
        if t == "agent_result":
            agent = ev["agent"]
            r = ev.get("result", {})
            msg = r.get("sub_goal") or r.get("target_label") or r.get("strategy") or \
                ("PASS" if r.get("success") else "FAIL") if "success" in r else r.get("reasoning", "")
            print(f"{COLORS.get(agent,'')}{agent.upper():9}{RESET} {msg}  "
                  f"\033[38;5;240m({ev['latency_ms']}ms){RESET}")
        elif t == "action":
            v = f" = {ev['value']!r}" if ev.get("value") is not None else ""
            print(f"  \033[38;5;44m↳ {ev['action']} {ev.get('target_label')}{v}{RESET}")
        elif t == "verification" and ev.get("mode") == "auto":
            ok = "✓" if ev["success"] else "✗"
            print(f"  \033[38;5;42m{ok} auto-verify {ev['observed']!r}{RESET}")
        elif t == "step_complete":
            print(f"\033[38;5;42m  ✓ STEP {ev['completed']}/{ev['total']}: {ev['sub_goal']}{RESET}\n")
        elif t == "step_failed":
            print(f"\033[38;5;196m  ✗ STEP FAILED: {ev['sub_goal']} — {ev['reason']}{RESET}")
        elif t == "run_complete":
            tag = "\033[38;5;42m✓ SUCCESS" if ev["success"] else "\033[38;5;196m✗ INCOMPLETE"
            print(f"\n{tag} — {ev['completed']}/{ev['total']} steps in "
                  f"{ev['elapsed_ms']/1000:.1f}s{RESET}")
        elif t == "fatal":
            print(f"\033[38;5;196mFATAL: {ev['error']}{RESET}")
    return emit


def run_once(port: int, workflow_path: Path) -> bool:
    workflow = Workflow.from_json(workflow_path)
    # If the workflow targets a local /web/ page, point it at THIS throwaway
    # server (port-agnostic). External URLs (recorded on real sites) are left
    # untouched. base_dir is preserved, so upload paths still resolve.
    if ("127.0.0.1" in workflow.url or "localhost" in workflow.url) and "/web/" in workflow.url:
        tail = workflow.url.split("/web/", 1)[-1]
        workflow.url = f"http://127.0.0.1:{port}/web/{tail}"
    browser = BrowserController()
    browser.start(workflow.url)
    try:
        orch = Orchestrator(get_llm(), browser, emit=make_emit())
        result = orch.run(workflow)
        return result["success"]
    finally:
        browser.stop()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--loops", type=int, default=1, help="number of consecutive runs")
    ap.add_argument("--port", type=int, default=8077)
    ap.add_argument("--workflow", type=Path, default=WORKFLOW,
                    help="path to a workflow.json (default: the built-in demo)")
    args = ap.parse_args()

    httpd = serve_root(args.port)
    print(f"Serving {ROOT} at http://127.0.0.1:{args.port}  |  provider={settings.llm_provider}")
    print(f"Workflow: {args.workflow}\n")
    passes = 0
    try:
        for i in range(args.loops):
            if args.loops > 1:
                print(f"\033[1m===== RUN {i+1}/{args.loops} =====\033[0m")
            passes += run_once(args.port, args.workflow)
    finally:
        httpd.shutdown()
    print(f"\n{passes}/{args.loops} runs succeeded.")
    return 0 if passes == args.loops else 1


if __name__ == "__main__":
    raise SystemExit(main())
