// background.js — recording session state, screenshots, and POSTs to the backend.
//
// State lives in chrome.storage.local so it survives the MV3 service worker being
// torn down between events. Each captured step gets a viewport screenshot
// (best-effort) and is forwarded to the FastAPI ingest endpoints.

const DEFAULT_BACKEND = "http://localhost:8000";

async function getState() {
  const s = await chrome.storage.local.get([
    "recording", "runId", "backendUrl", "tabId", "startTime", "stepCount", "lastResult",
  ]);
  return {
    recording: !!s.recording,
    runId: s.runId || null,
    backendUrl: s.backendUrl || DEFAULT_BACKEND,
    tabId: s.tabId ?? null,
    startTime: s.startTime || 0,
    stepCount: s.stepCount || 0,
    lastResult: s.lastResult || null,
  };
}

async function startRecording({ name, backendUrl }) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const base = backendUrl || DEFAULT_BACKEND;
  const res = await fetch(`${base}/api/recordings/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name || "workflow",
      url: tab.url,
      viewport: { width: tab.width, height: tab.height },
      user_agent: navigator.userAgent,
    }),
  });
  const data = await res.json();
  await chrome.storage.local.set({
    recording: true, runId: data.run_id, backendUrl: base,
    tabId: tab.id, startTime: Date.now(), stepCount: 0, lastResult: null,
  });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "STATE", recording: true });
  } catch (e) { /* content script not yet injected; it queries GET_STATE on load */ }
  return { ok: true, runId: data.run_id };
}

async function stopRecording() {
  const st = await getState();
  let result = null;
  if (st.runId) {
    try {
      const res = await fetch(`${st.backendUrl}/api/recordings/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: st.runId }),
      });
      result = await res.json();
    } catch (e) {
      result = { error: String(e) };
    }
  }
  if (st.tabId != null) {
    try {
      await chrome.tabs.sendMessage(st.tabId, { type: "STATE", recording: false });
    } catch (e) { /* tab gone */ }
  }
  await chrome.storage.local.set({ recording: false, runId: null, tabId: null, lastResult: result });
  return { ok: true, result };
}

async function recordStep(payload, sender) {
  const st = await getState();
  if (!st.recording || !st.runId) return;
  if (st.tabId != null && sender.tab && sender.tab.id !== st.tabId) return;

  let screenshot = null;
  try {
    screenshot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
  } catch (e) { /* rate-limited / not capturable — continue without a screenshot */ }

  const body = Object.assign({}, payload, {
    run_id: st.runId,
    t_offset_ms: Date.now() - st.startTime,
  });
  if (screenshot) body.screenshot = screenshot;

  try {
    await fetch(`${st.backendUrl}/api/recordings/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await chrome.storage.local.set({ stepCount: st.stepCount + 1 });
  } catch (e) { /* ignore a single failed step post */ }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "GET_STATE") { getState().then(sendResponse); return true; }
  if (msg.type === "START") { startRecording(msg).then(sendResponse); return true; }
  if (msg.type === "STOP") { stopRecording().then(sendResponse); return true; }
  if (msg.type === "STEP") { recordStep(msg.payload, sender).then(() => sendResponse({ ok: true })); return true; }
});
