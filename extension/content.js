// content.js — capture the user's actions and stream them to the background worker.
//
// Maps DOM events to the runner's action vocabulary (fill|select|check|uncheck|
// click|submit|upload). Typing is debounced into ONE `fill` per field (final
// value), never per-keystroke. Uses describeElement()/buildSelectors() from
// selectors.js (loaded first in the same content-script world).

let _recording = false;
let _pendingFill = null; // { el }
let _idleTimer = null;
const IDLE_MS = 600;

// The service worker may have restarted; learn the current recording state.
chrome.runtime.sendMessage({ type: "GET_STATE" }, (resp) => {
  if (chrome.runtime.lastError) return;
  _recording = !!(resp && resp.recording);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "STATE") _recording = !!msg.recording;
});

function _send(action, el, value, extra) {
  const payload = Object.assign(
    {
      action,
      value,
      element: describeElement(el),
      selectors: buildSelectors(el),
      url: location.href,
    },
    extra || {}
  );
  try {
    chrome.runtime.sendMessage({ type: "STEP", payload });
  } catch (e) {
    /* extension context invalidated (reloaded) — ignore */
  }
}

function _clearIdle() {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
}

function _flushPending() {
  if (!_pendingFill) return;
  const el = _pendingFill.el;
  _pendingFill = null;
  _clearIdle();
  if (el.value !== "") _send("fill", el, el.value);
}

function _isTextLike(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (el.isContentEditable) return true;
  if (tag !== "input") return false;
  const t = (el.type || "text").toLowerCase();
  return ["text", "email", "number", "tel", "search", "url", "password"].includes(t);
}

function _interactiveTarget(el) {
  return el.closest
    ? el.closest("button, a[href], [role=button], input[type=submit], input[type=button]")
    : null;
}

document.addEventListener(
  "input",
  (e) => {
    if (!_recording) return;
    const el = e.target;
    if (!_isTextLike(el)) return;
    if (_pendingFill && _pendingFill.el !== el) _flushPending();
    _pendingFill = { el };
    _clearIdle();
    _idleTimer = setTimeout(_flushPending, IDLE_MS);
  },
  true
);

document.addEventListener(
  "change",
  (e) => {
    if (!_recording) return;
    const el = e.target;
    const tag = el.tagName.toLowerCase();
    const type = (el.type || "").toLowerCase();
    if (_pendingFill && _pendingFill.el !== el) _flushPending();

    if (tag === "select") {
      const opt = el.options[el.selectedIndex];
      _send("select", el, opt ? opt.text : el.value);
    } else if (type === "checkbox") {
      _send(el.checked ? "check" : "uncheck", el, el.checked);
    } else if (type === "radio") {
      _send("check", el, el.value);
    } else if (type === "file") {
      const fn = el.files && el.files[0] ? el.files[0].name : "";
      _send("upload", el, fn, { filename: fn });
    } else if (tag === "input" || tag === "textarea" || el.isContentEditable) {
      // any other value-bearing field (text, date, time, color, range, …):
      // flush the typing buffer, or emit directly for pickers that only `change`.
      if (_pendingFill && _pendingFill.el === el) _flushPending();
      else if (el.value !== "") _send("fill", el, el.value);
    }
  },
  true
);

document.addEventListener(
  "focusout",
  (e) => {
    if (!_recording) return;
    if (_pendingFill && _pendingFill.el === e.target) _flushPending();
  },
  true
);

document.addEventListener(
  "click",
  (e) => {
    if (!_recording) return;
    const t = _interactiveTarget(e.target);
    if (!t) return; // clicks on inputs/labels are handled via input/change
    _flushPending();
    const type = (t.type || "").toLowerCase();
    const isSubmit =
      type === "submit" ||
      (t.tagName.toLowerCase() === "button" && type !== "button" && !!t.closest("form"));
    _send(isSubmit ? "submit" : "click", t, null);
  },
  true
);
