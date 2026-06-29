/**
 * Helpers for driving / measuring a same-origin form rendered inside an iframe.
 *
 * The Race UI and the form routes are the same Next app, so the iframe is
 * same-origin and we can read/write its DOM directly. This is what lets the
 * simulated "AI" visibly type into the form and what lets us position the
 * pulsing highlight over the field it's touching.
 */
import { FieldAction } from "@/lib/types/agent-events";

export function getDoc(iframe: HTMLIFrameElement | null): Document | null {
  try {
    return iframe?.contentDocument ?? null;
  } catch {
    return null; // cross-origin (shouldn't happen for our own routes)
  }
}

/** Fire the native events React/listeners expect after a programmatic change. */
function emitInput(el: Element) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Apply an agent field action to the form inside the iframe. */
export function applyFieldAction(
  doc: Document | null,
  fieldId: string,
  action: FieldAction,
  value?: string,
) {
  if (!doc) return;

  if (action === "focus") {
    const container = doc.querySelector(`[data-field-container="${fieldId}"]`);
    (container ?? doc.querySelector(`[data-field-id="${fieldId}"]`))?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    return;
  }

  // radio: target the specific option
  if (value !== undefined) {
    const radio = doc.querySelector(
      `[data-field-id="${fieldId}"][data-field-option="${value}"]`,
    ) as HTMLInputElement | null;
    if (radio) {
      radio.checked = true;
      emitInput(radio);
      return;
    }
  }

  const el = doc.querySelector(`[data-field-id="${fieldId}"]`) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | HTMLButtonElement
    | HTMLAnchorElement
    | null;
  if (!el) return;

  // buttons / links (e.g. the wizard's Next / Submit) get a real click
  if (action === "click" && (el.tagName === "BUTTON" || el.tagName === "A")) {
    (el as HTMLElement).click();
    return;
  }

  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    el.checked = value === undefined ? true : value === "true";
    emitInput(el);
  } else {
    (el as HTMLInputElement).value = value ?? "";
    emitInput(el);
  }
}

/** Bounding rect of a field's container, relative to the iframe viewport. */
export function fieldRect(doc: Document | null, fieldId: string): DOMRect | null {
  if (!doc) return null;
  const el =
    doc.querySelector(`[data-field-container="${fieldId}"]`) ??
    doc.querySelector(`[data-field-id="${fieldId}"]`);
  return el ? (el as HTMLElement).getBoundingClientRect() : null;
}

/** How many of the given fields currently hold a value (for the human counter). */
export function countFilled(doc: Document | null, fieldIds: string[]): number {
  if (!doc) return 0;
  let n = 0;
  for (const id of fieldIds) {
    const el = doc.querySelector(`[data-field-id="${id}"]`) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    if (!el) continue;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      if (el.checked) n++;
    } else if ((el as HTMLInputElement).value?.trim()) {
      n++;
    }
  }
  return n;
}

export function isSubmitted(doc: Document | null): boolean {
  if (!doc) return false;
  const banner = doc.getElementById("submit-success");
  return !!banner && getComputedStyle(banner).opacity === "1";
}
