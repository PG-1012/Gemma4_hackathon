/**
 * WebSocket event source — for when the real agent backend is live.
 *
 * Drop-in replacement for the simulator (same EventSource interface). The
 * backend's FastAPI server should emit AgentEvent-shaped JSON. If the backend's
 * native event names differ, adapt them in `adapt()` below rather than changing
 * the rest of the UI.
 *
 * Configure the URL via NEXT_PUBLIC_AGENT_WS_URL (defaults to the backend's
 * localhost dev port).
 */
import { AgentEvent, AgentEventHandler } from "@/lib/types/agent-events";
import { EventSource } from "./simulator";

const DEFAULT_URL =
  process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:8000/ws/run";

/** Translate a raw backend message into our AgentEvent contract. */
function adapt(raw: any): AgentEvent | null {
  // If the backend already speaks our contract, pass it through.
  if (raw && typeof raw.type === "string") {
    const known = [
      "race_started",
      "agent_state",
      "field_interaction",
      "step_completed",
      "verification",
      "recovery_triggered",
      "race_finished",
    ];
    if (known.includes(raw.type)) return raw as AgentEvent;
  }
  // TODO(backend): map the backend's native events here if they differ.
  return null;
}

export function createWsClient(
  onEvent: AgentEventHandler,
  url: string = DEFAULT_URL,
): EventSource {
  let ws: WebSocket | null = null;

  return {
    start: () => {
      ws = new WebSocket(url);
      ws.onopen = () => ws?.send(JSON.stringify({}));
      ws.onmessage = (m) => {
        try {
          const ev = adapt(JSON.parse(m.data));
          if (ev) onEvent(ev);
        } catch {
          /* ignore malformed frames */
        }
      };
    },
    stop: () => {
      ws?.close();
      ws = null;
    },
  };
}
