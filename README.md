# ⚡ Browser Speedrunner

Vision-based browser automation that watches a workflow, understands it, and
re-executes it autonomously at high speed using **Gemma 4 vision served by
Cerebras**. Built for the Cerebras × Google DeepMind Gemma 4 Hackathon.

Because it's **vision-grounded** it adapts when the UI changes (labels move,
fields get renamed) — unlike brittle selector-based RPA. Because it runs on
**Cerebras**, a 20-step workflow's 40–60 LLM calls finish in seconds, not
minutes.

## Multi-agent decomposition

Four genuinely separate agents coordinate in a loop — each has a narrow contract
and a strict JSON output, so the decomposition is real, not one prompt wearing
four hats:

| Agent | Sees | Decides |
|-------|------|---------|
| **Planner** (`agents/planner.py`) | workflow + progress (no pixels) | the next sub-goal |
| **Executor** (`agents/executor.py`) | sub-goal + screenshot + element map | the concrete action (vision-heavy) |
| **Verifier** (`agents/verifier.py`) | intended outcome + post-action state | success / failure |
| **Recovery** (`agents/recovery.py`) | failure context | retry / alternative / escalate |

The loop lives in `agents/orchestrator.py`. It measures per-call latency (the
Cerebras speed story) and emits live events to the UI. Safe actions (typing a
known string into a known field) skip the LLM Verifier and are confirmed
deterministically to cut latency.

### How vision stays reliable
The `BrowserController` (`browser/controller.py`) gives the Executor a screenshot
**plus** a numbered "set-of-marks" element map (index, label, type, value, bbox).
The model picks a target by *meaning*; actions resolve by a stable `data-aiidx`
attribute. This is robust like selectors but adaptive like vision.

## Project layout

```
web/expense-form.html   Mock 18-field enterprise expense form (the demo target)
web/index.html          Live agent-reasoning console (WebSocket UI)
backend/
  config.py             Env-driven settings (provider, browser, orchestration)
  llm/                  Provider layer: cerebras | anthropic | mock (one interface)
  browser/controller.py Playwright + set-of-marks element map
  workflow/             Workflow schema + the bulletproof demo workflow JSON
  agents/               Planner / Executor / Verifier / Recovery / Orchestrator
  app.py                FastAPI server (serves form + UI, streams events over WS)
  run_demo.py           CLI runner / smoke test ( --loops N for stress testing )
  split_screen.py       Human-vs-AI side-by-side runner for the demo video
```

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium

# Run the full loop offline (no API needed) — proves the pipeline end to end:
cd backend && python run_demo.py            # mock provider
python run_demo.py --loops 20               # reliability stress test

# Live UI + visible browser:
python app.py            # then open http://localhost:8000
```

## Providers

Swap backends with one env var — agents are unchanged:

```bash
LLM_PROVIDER=mock        # offline, deterministic (default; for plumbing tests)
LLM_PROVIDER=cerebras    # Gemma 4 on Cerebras  (set CEREBRAS_API_KEY + model id)
LLM_PROVIDER=anthropic   # vision fallback if Cerebras is down (demo safety net)
```

> **Kickoff TODOs (Cerebras):** set the exact Gemma multimodal model id
> (`CEREBRAS_MODEL`) and confirm the image content-part format in
> `llm/cerebras_client.py`. The OpenAI-compatible `image_url` data-URI path is
> wired and should work once the model id is in.

Copy `.env.example` → `.env` to configure.

## Demo video (Track 2)

```bash
cd backend && python split_screen.py
```
Opens the form in two windows (human left, AI right), waits for Enter to start
both at once. Record the screen; cut to 30s vertical for X, tag **@cerebras**.

## V1.5 — UI-adaptation demo
Duplicate `web/expense-form.html`, move/rename fields, point the workflow `url`
at it, and re-run. The Executor still completes it because it matches on meaning,
not position — the killer differentiator over traditional RPA.
