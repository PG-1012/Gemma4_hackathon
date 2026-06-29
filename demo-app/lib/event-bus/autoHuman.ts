/**
 * Optional "auto-human" — slowly fills the human iframe so the speedup counter
 * and "human still on step N" read-outs have data when you're shooting the demo
 * solo (no second person driving the left pane). Toggle off when a teammate is
 * actually racing.
 */
import { FIELDS, FormLayout, orderedFieldIds } from "@/lib/fields";
import { applyFieldAction, getDoc } from "@/lib/iframe";
import { FieldAction } from "@/lib/types/agent-events";
import { EventSource } from "./simulator";

function actionFor(type: string): FieldAction {
  if (type === "select") return "select";
  if (type === "checkbox" || type === "radio") return "click";
  return "type";
}

export function createAutoHuman(
  iframe: HTMLIFrameElement | null,
  layout: FormLayout,
  msPerField = 2400,
): EventSource {
  const ids = orderedFieldIds(layout);
  let i = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start: () => {
      i = 0;
      timer = setInterval(() => {
        const doc = getDoc(iframe);
        if (i >= ids.length) {
          if (timer) clearInterval(timer);
          return;
        }
        const id = ids[i++];
        const def = FIELDS[id];
        applyFieldAction(doc, id, "focus");
        applyFieldAction(doc, id, actionFor(def.type), def.sampleValue);
      }, msPerField);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
