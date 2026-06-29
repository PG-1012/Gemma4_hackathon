# Browser Speedrunner — Demo App

The visible demo surface for Browser Speedrunner: the mock enterprise expense
form the agent operates on, plus the side-by-side **human vs. AI** race UI that
makes the demo legible on camera. This is a **standalone Next.js app** — it has
no dependency on the agent backend and can be pushed/deployed on its own.

> The agent is the brain; this is the stage. The contract between them is the
> WebSocket event stream defined in [`lib/types/agent-events.ts`](lib/types/agent-events.ts).

## Run it

```bash
cd demo-app
npm install
npm run dev          # http://localhost:3000  → redirects to /race
```

Routes:
- `/race` — the split-screen demo surface (main stage)
- `/form-a` — the mock expense form, original layout
- `/form-b` — the same form, **mutated** layout (two-column, reordered, relabeled)

## Demo flow (the buttons, in order)

`Record → Compile → Race → Mutate UI → Rerun AI → Reset`

1. **Record** — opens Form A in a new tab to "demonstrate" the workflow. Click
   **Stop recording** when done (stubbed — no capture logic here; that's backend).
2. **Compile** — brief "compiling workflow" state, then **Ready to race**.
3. **Race** — both timers start. The AI side fills the form live with pulsing
   field highlights; the four agent cards activate in sequence; the speed-advantage
   counter climbs. Ends with confetti + "AI finished in 6.x s — human still on step N".
4. **Mutate UI** — both panes swap to Form B (fields moved/renamed/regrouped).
5. **Rerun AI** — the AI runs on the mutated layout; the **Recovery** agent fires
   partway ("UI changed — Gemma recovering") and it still completes. The money shot.
6. **Reset** — back to the start.

### Standalone vs. real backend
By default the race is driven by a **local simulator** (`lib/event-bus/simulator.ts`)
that emits the exact same `AgentEvent` stream the backend will send — so you can
shoot the whole video today. The **auto-human** toggle (top-right) slowly fills the
left pane so the speedup counter has data when you're demoing solo; turn it off when
a teammate races the human side manually.

To switch to the live agent backend, swap the simulator for
`createWsClient` (`lib/event-bus/websocket.ts`) in [`app/race/page.tsx`](app/race/page.tsx)
— same `EventSource` interface. Set the URL via `NEXT_PUBLIC_AGENT_WS_URL`
(default `ws://localhost:8000/ws/run`).

## How the AI "types" into the form
Both panes are same-origin iframes (`/form-a`, `/form-b`), so the UI drives the AI
pane's DOM directly: a `field_interaction` event sets the control's value and the
highlight overlay is positioned from the field's bounding box. No Playwright, no
cross-window screen-sharing — looks identical on video. See [`lib/iframe.ts`](lib/iframe.ts).

## Field identity
Every control carries a stable `data-field-id` (e.g. `data-field-id="amount"`),
identical across Form A and Form B. Layouts differ only in order, labels, grouping,
and dropdown option order — see [`lib/fields.ts`](lib/fields.ts). That's what proves
the agent matches fields by **meaning**, not position.

## Recording the video (Track 2)
Dark theme, mono timers, cyber-green AI accent vs. neutral human side, "VS" framing,
pulsing highlights, confetti on finish. Key beats to capture: **race start**,
**AI finishing while human lags**, **mutation**, **recovery**. Built with a 30s
vertical X clip in mind.

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind CSS · React state only (no DB).
