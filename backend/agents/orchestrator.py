"""Multi-agent orchestration loop.

Coordinates Planner -> Executor -> (Verifier) -> [Recovery] for each step of a
workflow. Emits structured events through `emit` so the live UI can show which
agent is active, what it decided, and how long each call took (the Cerebras
speed story). Latency per LLM call is measured and reported.

Verifier policy: actions that cannot silently fail (typing a known string into a
known field) are confirmed deterministically by reading the value back, skipping
an LLM round-trip (config.skip_safe_verification). Everything else gets a real
Verifier pass. This keeps the loop fast without losing the safety net.
"""
from __future__ import annotations

import time
from typing import Any, Callable

from config import settings
from llm import LLMClient
from browser import BrowserController
from workflow import Workflow
from .planner import Planner
from .executor import Executor
from .verifier import Verifier
from .recovery import Recovery

Emit = Callable[[dict[str, Any]], None]

_SAFE_ACTIONS = {"fill", "type"}


class Orchestrator:
    def __init__(
        self,
        llm: LLMClient,
        browser: BrowserController,
        emit: Emit | None = None,
    ) -> None:
        self.llm = llm
        self.browser = browser
        self.emit = emit or (lambda e: None)
        self.planner = Planner(llm)
        self.executor = Executor(llm)
        self.verifier = Verifier(llm)
        self.recovery = Recovery(llm)

    def _timed(self, agent: str, fn: Callable[[], dict], **meta) -> dict:
        self.emit({"type": "agent_start", "agent": agent, **meta})
        t0 = time.perf_counter()
        result = fn()
        ms = round((time.perf_counter() - t0) * 1000)
        self.emit({"type": "agent_result", "agent": agent, "latency_ms": ms,
                   "result": result, **meta})
        return result

    def _screen_summary(self, elements: list[dict], completed: int, total: int) -> str:
        return f"{len(elements)} interactable elements visible; {completed}/{total} steps done."

    def run(self, workflow: Workflow) -> dict[str, Any]:
        run_start = time.perf_counter()
        self.emit({"type": "run_start", "workflow": workflow.name,
                   "total_steps": len(workflow.steps), "provider": self.llm.name})
        completed: list[int] = []
        total = len(workflow.steps)

        while True:
            elements = self.browser.element_map()
            summary = self._screen_summary(elements, len(completed), total)

            plan = self._timed(
                "planner",
                lambda: self.planner.next_goal(workflow, completed, summary),
            )
            if plan.get("done"):
                break

            step_index = plan.get("_step_index")
            if step_index is None:
                break
            step = workflow.steps[step_index]

            success = False
            last_failure = ""
            for attempt in range(1, settings.max_retries_per_step + 2):
                elements = self.browser.element_map()
                marks = [e["index"] for e in elements]
                shot = self.browser.screenshot(marks)

                decision = self._timed(
                    "executor",
                    lambda: self.executor.decide(plan, elements, shot),
                    step_index=step_index,
                )

                if decision.get("action") == "noop" or decision.get("index") is None:
                    last_failure = decision.get("reasoning", "No actionable element.")
                    self._maybe_recover(plan, decision, last_failure, attempt)
                    continue

                idx = decision["index"]
                try:
                    self.browser.act(decision["action"], idx, decision.get("value"))
                    self.emit({"type": "action", "agent": "executor", "step_index": step_index,
                               "action": decision["action"], "index": idx,
                               "value": decision.get("value"),
                               "target_label": decision.get("target_label")})
                except Exception as exc:  # action raised — let Recovery decide
                    last_failure = f"Action error: {exc}"
                    if self._maybe_recover(plan, decision, last_failure, attempt) == "escalate":
                        break
                    continue

                expected = step.verify_target
                observed = self.browser.value_of(idx)

                if step.action in _SAFE_ACTIONS and settings.skip_safe_verification:
                    ok = str(observed).strip() == str(expected).strip()
                    self.emit({"type": "verification", "agent": "verifier", "mode": "auto",
                               "step_index": step_index, "success": ok,
                               "observed": observed, "expected": expected})
                else:
                    post_shot = self.browser.screenshot()
                    verdict = self._timed(
                        "verifier",
                        lambda: self.verifier.check(plan, expected, observed, post_shot),
                        step_index=step_index,
                    )
                    ok = bool(verdict.get("success"))
                    if not ok:
                        last_failure = verdict.get("reasoning", "Verification failed.")

                if ok:
                    success = True
                    break

                if self._maybe_recover(plan, decision, last_failure, attempt) == "escalate":
                    break

            if success:
                completed.append(step_index)
                self.emit({"type": "step_complete", "step_index": step_index,
                           "sub_goal": step.sub_goal,
                           "completed": len(completed), "total": total})
            else:
                self.emit({"type": "step_failed", "step_index": step_index,
                           "sub_goal": step.sub_goal, "reason": last_failure})
                break

        elapsed_ms = round((time.perf_counter() - run_start) * 1000)
        done = len(completed) == total
        self.emit({"type": "run_complete", "success": done,
                   "completed": len(completed), "total": total,
                   "elapsed_ms": elapsed_ms})
        return {"success": done, "completed": len(completed), "total": total,
                "elapsed_ms": elapsed_ms}

    def _maybe_recover(
        self, plan: dict, decision: dict, reason: str, attempt: int
    ) -> str:
        """Run the Recovery agent. Returns the chosen strategy."""
        rec = self._timed(
            "recovery",
            lambda: self.recovery.plan(plan, decision, reason, attempt),
        )
        return rec.get("strategy", "retry")
