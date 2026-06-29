/**
 * Agent → Race-UI event contract.
 *
 * This is the integration boundary with the backend team. The agent backend
 * streams these events over a WebSocket; the Race UI renders them. Keep this
 * file as the single source of truth — if the shape changes, both sides change
 * here first.
 *
 * The same `fieldId` values are the `data-field-id` attributes on the form
 * controls (see lib/fields.ts). That's how a `field_interaction` event maps to
 * a specific control on screen, regardless of layout (Form A vs Form B).
 */

export type AgentName = "planner" | "executor" | "verifier" | "recovery";
export type AgentState = "idle" | "thinking" | "acting";
export type FieldAction = "focus" | "type" | "click" | "select";

export type AgentEvent =
  | { type: "race_started"; timestamp: number }
  | {
      type: "agent_state";
      agent: AgentName;
      state: AgentState;
      reasoning?: string;
    }
  | {
      type: "field_interaction";
      fieldId: string;
      action: FieldAction;
      value?: string;
    }
  | { type: "step_completed"; stepNumber: number; totalSteps: number }
  | { type: "verification"; success: boolean; details?: string }
  | { type: "recovery_triggered"; reason: string }
  | { type: "race_finished"; totalTime: number; success: boolean };

/** Convenience union of event `type` strings. */
export type AgentEventType = AgentEvent["type"];

/** Handler the Race UI registers with an event source (WS or simulator). */
export type AgentEventHandler = (event: AgentEvent) => void;
