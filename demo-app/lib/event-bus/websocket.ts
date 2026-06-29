/**
 * Live WebSocket event source — drives the race UI from the REAL Python backend
 * (Gemma 4 on Cerebras) instead of the local simulator.
 *
 * The backend emits its own event vocabulary (run_start / agent_start /
 * agent_result / action / step_complete / run_complete) operating on its own
 * copy of the expense form. `adapt()` translates each backend event into one or
 * more demo-app AgentEvents, mapping the backend's DOM field names onto the
 * demo-app's data-field-ids so the AI iframe fills live.
 *
 * Configure the URL via NEXT_PUBLIC_AGENT_WS_URL (default = backend dev port).
 */
import {
  AgentEvent,
  AgentEventHandler,
  AgentName,
  FieldAction,
} from "@/lib/types/agent-events";
import { EventSource } from "./simulator";

const DEFAULT_URL =
  process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:8000/ws/run";

// Backend DOM field name  ->  demo-app data-field-id (Form A).
const FIELD_MAP: Record<string, string> = {
  employee_name: "employee-name",
  employee_id: "employee-id",
  email: "email",
  department: "department",
  category: "expense-category",
  amount: "amount",
  expense_date: "expense-date",
  vendor: "vendor-name",
  project_code: "project-code",
  cost_center: "cost-center",
  justification: "business-justification",
  manager: "manager-name",
  payment_method: "payment-method",
  receipts_attached: "receipt-attached",
  billable: "billable",
  terms: "terms",
  "submit-btn": "submit",
};

function mapAction(a: string): FieldAction {
  if (a === "select") return "select";
  if (a === "fill" || a === "type") return "type";
  return "click"; // check / uncheck / submit / click
}

export function createWsClient(
  onEvent: AgentEventHandler,
  url: string = DEFAULT_URL,
): EventSource {
  let ws: WebSocket | null = null;
  let prevAgent: AgentName | null = null;

  const idle = (a: AgentName) => onEvent({ type: "agent_state", agent: a, state: "idle" });

  /** Translate one backend message into zero or more demo-app AgentEvents. */
  function adapt(raw: any): void {
    switch (raw?.type) {
      case "run_start":
        prevAgent = null;
        onEvent({ type: "race_started", timestamp: Date.now() });
        break;
      case "agent_start": {
        const a = raw.agent as AgentName;
        if (prevAgent && prevAgent !== a) idle(prevAgent);
        prevAgent = a;
        onEvent({ type: "agent_state", agent: a, state: "acting" });
        if (a === "recovery")
          onEvent({ type: "recovery_triggered", reason: "Recovering — re-grounding the step." });
        break;
      }
      case "agent_result": {
        const a = raw.agent as AgentName;
        const r = raw.result || {};
        const reasoning = r.reasoning || r.sub_goal || r.what_changed || r.strategy;
        onEvent({ type: "agent_state", agent: a, state: "acting", reasoning });
        break;
      }
      case "action": {
        const fieldId = FIELD_MAP[raw.field];
        if (!fieldId) break;
        const action = mapAction(raw.action);
        onEvent({ type: "field_interaction", fieldId, action: "focus" });
        onEvent({
          type: "field_interaction",
          fieldId,
          action,
          value: raw.value == null ? undefined : String(raw.value),
        });
        break;
      }
      case "step_complete":
        onEvent({ type: "step_completed", stepNumber: raw.completed, totalSteps: raw.total });
        break;
      case "run_complete":
        (["planner", "executor", "verifier", "recovery"] as AgentName[]).forEach(idle);
        onEvent({ type: "race_finished", totalTime: raw.elapsed_ms ?? 0, success: !!raw.success });
        break;
      case "fatal":
      case "step_failed":
        onEvent({ type: "recovery_triggered", reason: raw.error || raw.reason || "Step failed." });
        break;
    }
  }

  return {
    start: () => {
      prevAgent = null;
      ws = new WebSocket(url);
      ws.onopen = () => ws?.send(JSON.stringify({}));
      ws.onmessage = (m) => {
        try {
          adapt(JSON.parse(m.data));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onerror = () =>
        onEvent({ type: "recovery_triggered", reason: "Could not reach the live backend (ws://localhost:8000)." });
    },
    stop: () => {
      ws?.close();
      ws = null;
    },
  };
}
