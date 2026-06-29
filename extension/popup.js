// popup.js — drive start/stop and show recording status.

const $ = (id) => document.getElementById(id);

function render(st) {
  if (!st) st = { recording: false };
  if (st.recording) {
    $("status").innerHTML =
      `<span class="rec">● Recording…</span>\n${st.stepCount || 0} steps captured`;
    $("start").disabled = true;
    $("stop").disabled = false;
  } else {
    $("start").disabled = false;
    $("stop").disabled = true;
    const r = st.lastResult;
    if (r && r.error) {
      $("status").textContent = "Error: " + r.error;
    } else if (r) {
      let msg = `✓ Saved ${r.step_count} steps to:\n${r.dir}`;
      if (r.uploads_needed && r.uploads_needed.length) {
        msg += `\n\nDrop the actual file(s) into that folder:\n` + r.uploads_needed.join("\n");
      }
      $("status").textContent = msg;
    } else {
      $("status").textContent = "Idle.";
    }
  }
}

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, render);
}

$("start").addEventListener("click", () => {
  const name = $("name").value || "workflow";
  const backendUrl = $("backend").value || "http://localhost:8000";
  $("status").textContent = "Starting…";
  chrome.runtime.sendMessage({ type: "START", name, backendUrl }, () => setTimeout(refresh, 250));
});

$("stop").addEventListener("click", () => {
  $("status").textContent = "Saving…";
  chrome.runtime.sendMessage({ type: "STOP" }, () => setTimeout(refresh, 250));
});

chrome.storage.local.get(["backendUrl"], (s) => {
  if (s.backendUrl) $("backend").value = s.backendUrl;
});

// keep the step counter live while the popup is open
setInterval(refresh, 1000);
refresh();
