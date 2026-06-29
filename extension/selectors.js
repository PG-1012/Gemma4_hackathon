// selectors.js — element description + ranked selector building.
//
// Runs in the content-script isolated world; functions declared here are visible
// to content.js (same world, loaded first). The visible()/labelFor() helpers are
// intentionally byte-identical to backend/browser/controller.py `_SNAPSHOT_JS`
// so a recorded `label` matches what the Playwright runner perceives at replay.

function _norm(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function _labelFor(el) {
  if (el.id) {
    const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (l && l.innerText) return l.innerText;
  }
  const wrap = el.closest("label");
  if (wrap && wrap.innerText) return wrap.innerText;
  if (el.getAttribute && el.getAttribute("aria-label")) return el.getAttribute("aria-label");
  if (el.placeholder) return el.placeholder;
  return (el.innerText || el.value || "").slice(0, 50);
}

// Heuristic: framework-generated ids (long, hashed, or digit-heavy) are unstable.
function _isAutoId(id) {
  if (!id) return true;
  return id.length > 40 || /[0-9a-f]{6,}/i.test(id) || /:\w/.test(id);
}

function _cssPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== "html") {
    if (node.id && !_isAutoId(node.id)) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    let sel = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (parent) {
      const sames = [...parent.children].filter((c) => c.tagName === node.tagName);
      if (sames.length > 1) sel += `:nth-of-type(${sames.indexOf(node) + 1})`;
    }
    parts.unshift(sel);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

// Nearest preceding section heading (h1-h6 or .section-title) — gives an LLM the
// "which part of the form" context, e.g. "Approval" vs "Employee".
function _sectionHeading(el) {
  let node = el;
  while (node) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName) || sib.classList.contains("section-title")) {
        return _norm(sib.innerText).slice(0, 80);
      }
      const inner = sib.querySelector && sib.querySelector("h1,h2,h3,h4,h5,h6,.section-title");
      if (inner) return _norm(inner.innerText).slice(0, 80);
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return "";
}

// Trimmed text of the element's field container (label + helper text), value removed.
function _nearbyText(el) {
  const box = el.closest(".field, label, fieldset, .form-group, .form-row");
  const t = box ? _norm(box.innerText) : "";
  return t.slice(0, 160);
}

function describeElement(el) {
  const r = el.getBoundingClientRect();
  const tag = el.tagName.toLowerCase();
  const attr = (n) => (el.getAttribute ? el.getAttribute(n) : null) || undefined;
  // input validation constraints — useful for an LLM to understand the field
  const constraints = {};
  for (const k of ["minLength", "maxLength", "min", "max", "step", "pattern", "inputMode"]) {
    const v = el[k];
    if (v !== undefined && v !== null && v !== "" && !(k === "maxLength" && v === 524288) && v !== -1) {
      constraints[k] = v;
    }
  }
  return {
    tag,
    type: attr("type") || el.type || "",
    name: el.name || "",
    id: el.id || "",
    label: _norm(_labelFor(el)),
    placeholder: el.placeholder || "",
    value: el.value || "",
    checked: !!el.checked,
    options: tag === "select" ? [...el.options].map((o) => o.text).filter(Boolean) : null,
    // --- richer grounding for an LLM ---
    role: attr("role"),
    ariaLabel: attr("aria-label"),
    required: !!el.required,
    disabled: !!el.disabled,
    readonly: !!el.readOnly,
    autocomplete: attr("autocomplete"),
    constraints: Object.keys(constraints).length ? constraints : undefined,
    section: _sectionHeading(el),
    nearbyText: _nearbyText(el),
    outerHTML: (el.outerHTML || "").replace(/\s+/g, " ").slice(0, 240),
    box: {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
    },
  };
}

// Ranked selectors (highest confidence first). Stored in recording.json for
// grounding / future deterministic replay; the vision runner doesn't require them.
function buildSelectors(el) {
  const out = [];
  const tag = el.tagName.toLowerCase();
  const form = el.closest("form");
  const scope = form && form.id && !_isAutoId(form.id) ? `form#${CSS.escape(form.id)} ` : "";

  if (el.id && !_isAutoId(el.id)) out.push({ kind: "id", value: `#${CSS.escape(el.id)}`, rank: 100 });
  if (el.name) out.push({ kind: "name", value: `${scope}[name="${CSS.escape(el.name)}"]`, rank: 90 });
  out.push({ kind: "css", value: _cssPath(el), rank: 70 });
  const lab = _norm(_labelFor(el));
  if (lab) out.push({ kind: "label", value: lab, rank: 60 });
  if (el.placeholder) out.push({ kind: "placeholder", value: `[placeholder="${CSS.escape(el.placeholder)}"]`, rank: 50 });
  if (tag === "button" || tag === "a") {
    const t = _norm(el.innerText);
    if (t) out.push({ kind: "text", value: t, rank: 40 });
  }
  const parent = el.parentElement;
  if (parent) {
    const sames = [...parent.children].filter((c) => c.tagName === el.tagName);
    out.push({ kind: "nth", value: `${tag}:nth-of-type(${sames.indexOf(el) + 1})`, rank: 10 });
  }
  return out;
}
