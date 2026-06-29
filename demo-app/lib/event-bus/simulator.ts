/**
 * Local event simulator.
 *
 * Emits the exact same AgentEvent stream the real backend will send, so the full
 * demo (race → highlights → agent panel → recovery) works standalone for
 * shooting the video before backend integration. Swap this for `createWsClient`
 * (same interface) once the agent backend is emitting events.
 */
import {
  FIELDS,
  FieldType,
  FormLayout,
  labelFor,
  orderedFieldIds,
} from "@/lib/fields";
import {
  AgentEvent,
  AgentEventHandler,
  AgentName,
  FieldAction,
} from "@/lib/types/agent-events";

export interface EventSource {
  start: () => void;
  stop: () => void;
}

interface SimOptions {
  layout: FormLayout;
  onEvent: AgentEventHandler;
  withRecovery?: boolean; // inject a recovery beat (used on the post-mutation rerun)
  speed?: number; // 1 = default; >1 faster
}

function actionFor(type: FieldType): FieldAction {
  if (type === "select") return "select";
  if (type === "checkbox" || type === "radio") return "click";
  return "type";
}

export function createSimulator(opts: SimOptions): EventSource {
  const { layout, onEvent, withRecovery = false } = opts;
  const speed = opts.speed ?? 1;
  const ids = orderedFieldIds(layout);
  const total = ids.length;
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms / speed);
      timers.push(t);
    });

  const idle = (agent: AgentName) =>
    onEvent({ type: "agent_state", agent, state: "idle" });

  async function run() {
    onEvent({ type: "race_started", timestamp: Date.now() });
    await sleep(250);

    // recovery fires roughly a third of the way in, on the mutated layout
    const recoveryAt = withRecovery ? Math.floor(total / 3) : -1;

    for (let i = 0; i < total; i++) {
      if (cancelled) return;
      const id = ids[i];
      const def = FIELDS[id];
      const label = labelFor(layout, id);
      const action = actionFor(def.type);
      const value = def.sampleValue;

      if (i === recoveryAt) {
        onEvent({ type: "agent_state", agent: "verifier", state: "acting", reasoning: `Layout differs from the recording near "${label}".` });
        await sleep(180);
        onEvent({ type: "verification", success: false, details: "Field position changed — expected element not where recorded." });
        onEvent({ type: "recovery_triggered", reason: `UI changed near "${label}" — re-locating by meaning.` });
        onEvent({ type: "agent_state", agent: "recovery", state: "thinking", reasoning: "Layout mutated. Re-grounding fields visually instead of by position." });
        await sleep(420);
        onEvent({ type: "agent_state", agent: "recovery", state: "idle" });
      }

      // Planner
      onEvent({ type: "agent_state", agent: "planner", state: "thinking", reasoning: `Next sub-goal: ${def.type === "checkbox" ? "confirm" : "fill"} "${label}".` });
      await sleep(95);
      idle("planner");

      // Executor — vision: locate + act
      onEvent({ type: "agent_state", agent: "executor", state: "acting", reasoning: `Located "${label}" on screen — ${action === "type" ? "typing" : action === "select" ? "selecting option" : "clicking"}.` });
      onEvent({ type: "field_interaction", fieldId: id, action: "focus" });
      await sleep(120);
      onEvent({ type: "field_interaction", fieldId: id, action, value });
      await sleep(80);
      idle("executor");

      // Verifier — skip-safe check for plain typing keeps it snappy
      onEvent({ type: "agent_state", agent: "verifier", state: "acting", reasoning: `Confirming "${label}".` });
      await sleep(60);
      onEvent({ type: "verification", success: true, details: `"${label}" set to ${value}.` });
      idle("verifier");

      onEvent({ type: "step_completed", stepNumber: i + 1, totalSteps: total });
      await sleep(50);
    }

    if (cancelled) return;
    onEvent({ type: "race_finished", totalTime: 0, success: true });
  }

  return {
    start: () => {
      cancelled = false;
      run();
    },
    stop: () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    },
  };
}
