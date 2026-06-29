/**
 * Visa-workflow simulator + auto-human.
 *
 * Drives the 6-page wizard: fills the visible fields on a page, clicks "Next"
 * to advance, and repeats — emitting the SAME AgentEvent stream as the expense
 * simulator, so the race UI consumes it with zero changes. Page navigation is a
 * `field_interaction` click on the wizard's Next button (data-field-id
 * "wizard-next"), which the iframe driver turns into a real button click.
 *
 * Conditional fields: we statically include only the fields that WILL be visible
 * given the sample values (a trigger whose sample answer reveals its dependent),
 * so the agent never "fills" a hidden field.
 */
import {
  VISA_FIELDS,
  VisaFieldDef,
  VisaLayout,
  visaLabel,
  visaOrderedFieldIds,
  visaPageOf,
} from "@/lib/visa-fields";
import { applyFieldAction, getDoc } from "@/lib/iframe";
import { AgentEventHandler, AgentName, FieldAction } from "@/lib/types/agent-events";
import { EventSource } from "./simulator";

function fieldAction(def: VisaFieldDef): FieldAction {
  if (def.type === "select") return "select";
  if (def.type === "radio" || def.type === "checkbox") return "click";
  return "type";
}

/** Will this field be visible, given the sample answer to its trigger? */
function willBeVisible(def: VisaFieldDef): boolean {
  const rule = def.showIf;
  if (!rule) return true;
  const trigger = VISA_FIELDS[rule.field];
  const sv = trigger?.sampleValue ?? "";
  if (rule.equals !== undefined) return sv === rule.equals;
  if (rule.lessThan !== undefined) return Number(sv || 0) < rule.lessThan;
  return true;
}

export interface VisaStep {
  id: string;
  page: number;
  def: VisaFieldDef;
}

/** Ordered list of the fields the agent will actually fill (visible ones). */
export function visibleVisaSteps(layout: VisaLayout): VisaStep[] {
  return visaOrderedFieldIds(layout)
    .map((id) => VISA_FIELDS[id])
    .filter(willBeVisible)
    .map((def) => ({ id: def.id, page: visaPageOf(layout, def.id), def }));
}

interface SimOptions {
  layout: VisaLayout;
  onEvent: AgentEventHandler;
  withRecovery?: boolean;
  speed?: number;
}

export function createVisaSimulator(opts: SimOptions): EventSource {
  const { layout, onEvent, withRecovery = false } = opts;
  const speed = opts.speed ?? 1.6; // brisk — there are ~70+ fields
  const steps = visibleVisaSteps(layout);
  const total = steps.length;
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

    const recoveryAt = withRecovery ? Math.floor(total / 3) : -1;
    let curPage = 0;

    for (let i = 0; i < total; i++) {
      if (cancelled) return;
      const { def, page } = steps[i];
      const label = visaLabel(layout, def.id);

      // advance the wizard to this field's page
      while (curPage < page) {
        onEvent({ type: "agent_state", agent: "planner", state: "thinking", reasoning: "Section complete — advancing to the next page." });
        await sleep(90);
        onEvent({ type: "agent_state", agent: "executor", state: "acting", reasoning: "Clicking “Next” to continue the application." });
        onEvent({ type: "field_interaction", fieldId: "wizard-next", action: "focus" });
        await sleep(110);
        onEvent({ type: "field_interaction", fieldId: "wizard-next", action: "click" });
        idle("executor");
        curPage++;
        await sleep(420); // let the next page render
      }

      if (i === recoveryAt) {
        onEvent({ type: "agent_state", agent: "verifier", state: "acting", reasoning: `Layout differs from the recording near "${label}".` });
        await sleep(180);
        onEvent({ type: "verification", success: false, details: "Field moved to a different section — not where recorded." });
        onEvent({ type: "recovery_triggered", reason: `UI changed near "${label}" — re-locating by meaning.` });
        onEvent({ type: "agent_state", agent: "recovery", state: "thinking", reasoning: "Portal layout mutated. Re-grounding fields visually instead of by position." });
        await sleep(420);
        onEvent({ type: "agent_state", agent: "recovery", state: "idle" });
      }

      const action = fieldAction(def);
      const value = def.sampleValue || "—";

      onEvent({ type: "agent_state", agent: "planner", state: "thinking", reasoning: `Next: ${def.type === "checkbox" ? "confirm" : "fill"} "${label}".` });
      await sleep(70);
      idle("planner");

      onEvent({ type: "agent_state", agent: "executor", state: "acting", reasoning: `Located "${label}" on screen — ${action === "type" ? "typing" : action === "select" ? "selecting" : "selecting option"}.` });
      onEvent({ type: "field_interaction", fieldId: def.id, action: "focus" });
      await sleep(95);
      onEvent({ type: "field_interaction", fieldId: def.id, action, value });
      await sleep(55);
      idle("executor");

      onEvent({ type: "agent_state", agent: "verifier", state: "acting", reasoning: `Confirming "${label}".` });
      await sleep(45);
      onEvent({ type: "verification", success: true, details: `"${label}" set.` });
      idle("verifier");

      onEvent({ type: "step_completed", stepNumber: i + 1, totalSteps: total });
      await sleep(40);
    }

    if (cancelled) return;
    // final submit
    onEvent({ type: "agent_state", agent: "executor", state: "acting", reasoning: "Submitting the application." });
    onEvent({ type: "field_interaction", fieldId: "wizard-submit", action: "click" });
    idle("executor");
    await sleep(200);
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

/** Slow "human" filling the visa form (for solo demos / the speedup counter). */
export function createVisaAutoHuman(
  iframe: HTMLIFrameElement | null,
  layout: VisaLayout,
  msPerField = 2600,
): EventSource {
  const steps = visibleVisaSteps(layout);
  let i = 0;
  let curPage = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start: () => {
      i = 0;
      curPage = 0;
      timer = setInterval(() => {
        const doc = getDoc(iframe);
        if (i >= steps.length) {
          if (timer) clearInterval(timer);
          return;
        }
        const { def, page } = steps[i];
        if (curPage < page) {
          applyFieldAction(doc, "wizard-next", "click");
          curPage++;
          return; // spend this tick on navigation
        }
        i++;
        const action = fieldAction(def);
        applyFieldAction(doc, def.id, "focus");
        applyFieldAction(doc, def.id, action, def.sampleValue || "—");
      }, msPerField);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
