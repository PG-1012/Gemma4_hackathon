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

## Running everything

There are two runnable pieces: the **Python agent backend** (`backend/`) and the
**Next.js demo UI** (`demo-app/`). They run independently — the backend proves the
multi-agent pipeline; the demo-app is the on-camera race surface and can run
standalone (driven by a local event simulator) or wired to the backend over a
WebSocket.

### 1. Backend (agents + Playwright)

```bash
# from the repo root
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium      # one-time: download the browser

cp .env.example .env                        # defaults to the offline mock provider

cd backend
python run_demo.py                          # full multi-agent loop, offline (mock)
python run_demo.py --loops 20               # reliability stress test
python app.py                               # live UI + WS server → http://localhost:8000
```

- `run_demo.py` runs the orchestration loop end to end and prints per-call
  latency. Flags: `--loops N` (consecutive runs), `--port`, `--workflow <path>`.
- `app.py` serves the mock form + reasoning console and streams agent events over
  `WS /ws/run`. It binds `0.0.0.0:8000`.
- Set `HEADLESS=false` in `.env` to watch the browser; `HEADLESS=true` to run silently.

> **macOS note:** Playwright's Chromium must be launched from a normal interactive
> terminal — it can fail with a Mach-port error when started from inside a
> sandboxed/agent subprocess.

### 2. Demo UI (Next.js race surface)

Requires Node.js 18.17+ (Node 20 LTS recommended) and npm.

```bash
cd demo-app
npm install
npm run dev          # http://localhost:3000  → redirects to /race
# or a production build:
npm run build && npm run start
```

Routes: `/race` (split-screen demo — toggle **Expense / Visa** in the top bar),
`/form-a` & `/form-b` (expense form, original vs. mutated layout), `/visa-a` &
`/visa-b` (6-page government wizard, original vs. mutated). By default the race is
driven by a local simulator; to drive it from the real backend, point
`NEXT_PUBLIC_AGENT_WS_URL` at the backend (default `ws://localhost:8000/ws/run`)
and swap in `createWsClient` — see `demo-app/README.md`.

### 3. Browser extension (optional)

`extension/` is an unpacked Chrome extension for capturing real workflows. Load it
via `chrome://extensions` → **Developer mode** → **Load unpacked** → select
`extension/`. See `extension/README.md`.

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
