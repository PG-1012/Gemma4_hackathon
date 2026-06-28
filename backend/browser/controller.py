"""Playwright browser controller.

Bridges the vision model and the DOM. For each turn it produces:
  - a screenshot (optionally with numbered "set-of-marks" overlays), and
  - a structured element map: every interactable element tagged with a stable
    index, label, value, and bounding box.

The Executor reasons over the screenshot + element map and returns an action
keyed by element index. Acting by index (resolved to a `data-aiidx` attribute)
is far more reliable than raw pixel clicks, while staying vision-grounded — the
model still has to *look* to pick the right element, which is what lets it adapt
when the UI layout changes.
"""
from __future__ import annotations

from typing import Any

from playwright.sync_api import sync_playwright, Page, Browser, Playwright

from config import settings

# JS injected to tag + describe every interactable element.
_SNAPSHOT_JS = r"""
() => {
  const SEL = 'input, select, textarea, button, a[href], [role=button], [contenteditable=true]';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' &&
           s.display !== 'none' && parseFloat(s.opacity) > 0.05;
  };
  const labelFor = (el) => {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                 if (l && l.innerText) return l.innerText; }
    const wrap = el.closest('label'); if (wrap && wrap.innerText) return wrap.innerText;
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.placeholder) return el.placeholder;
    return (el.innerText || el.value || '').slice(0, 50);
  };
  const els = [...document.querySelectorAll(SEL)].filter(visible);
  return els.map((el, i) => {
    el.setAttribute('data-aiidx', i);
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    return {
      index: i, tag, type: el.type || '', name: el.name || '', id: el.id || '',
      label: labelFor(el).replace(/\s+/g, ' ').trim(),
      value: el.value || '', checked: !!el.checked,
      options: tag === 'select' ? [...el.options].map(o => o.text).filter(Boolean) : null,
      cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
      box: { x: Math.round(r.x), y: Math.round(r.y),
             w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
}
"""

_DRAW_MARKS_JS = r"""
(indices) => {
  document.querySelectorAll('.__ai_mark').forEach(n => n.remove());
  for (const i of indices) {
    const el = document.querySelector(`[data-aiidx="${i}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const tag = document.createElement('div');
    tag.className = '__ai_mark';
    tag.textContent = i;
    Object.assign(tag.style, {
      position: 'fixed', left: (r.x - 2) + 'px', top: (r.y - 2) + 'px',
      background: '#ef4444', color: '#fff', font: '700 11px monospace',
      padding: '0 4px', borderRadius: '4px', zIndex: 2147483647,
      pointerEvents: 'none', lineHeight: '16px',
    });
    document.body.appendChild(tag);
  }
}
"""

_CLEAR_MARKS_JS = "() => document.querySelectorAll('.__ai_mark').forEach(n => n.remove())"


class BrowserController:
    def __init__(self) -> None:
        self._pw: Playwright | None = None
        self._browser: Browser | None = None
        self.page: Page | None = None

    def start(self, url: str | None = None) -> None:
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=settings.headless)
        ctx = self._browser.new_context(
            viewport={"width": settings.viewport_width, "height": settings.viewport_height}
        )
        self.page = ctx.new_page()
        self.goto(url or settings.form_url)

    def goto(self, url: str) -> None:
        assert self.page
        self.page.goto(url, wait_until="domcontentloaded")

    # --- perception ---
    def element_map(self) -> list[dict[str, Any]]:
        assert self.page
        return self.page.evaluate(_SNAPSHOT_JS)

    def screenshot(self, mark_indices: list[int] | None = None) -> bytes:
        """PNG bytes of the viewport. If marks requested, overlay then clean up."""
        assert self.page
        if settings.use_set_of_marks and mark_indices:
            self.page.evaluate(_DRAW_MARKS_JS, mark_indices)
        png = self.page.screenshot(type="png")
        if mark_indices:
            self.page.evaluate(_CLEAR_MARKS_JS)
        return png

    def value_of(self, index: int) -> str:
        """Read back an element's current value/checked state for verification."""
        assert self.page
        return self.page.evaluate(
            """(i) => { const el = document.querySelector(`[data-aiidx="${i}"]`);
               if (!el) return null;
               if (el.type === 'checkbox' || el.type === 'radio') return String(el.checked);
               return el.value; }""",
            index,
        )

    # --- actions ---
    def _sel(self, index: int) -> str:
        return f'[data-aiidx="{index}"]'

    def click(self, index: int) -> None:
        assert self.page
        self.page.click(self._sel(index), timeout=5000)

    def fill(self, index: int, value: str) -> None:
        assert self.page
        self.page.fill(self._sel(index), str(value), timeout=5000)

    def select(self, index: int, value: str) -> None:
        assert self.page
        self.page.select_option(self._sel(index), label=str(value), timeout=5000)

    def check(self, index: int, checked: bool = True) -> None:
        assert self.page
        self.page.set_checked(self._sel(index), checked, timeout=5000)

    def act(self, action: str, index: int, value: Any = None) -> None:
        """Dispatch a structured action from the Executor."""
        action = (action or "").lower()
        if action in {"fill", "type"}:
            self.fill(index, value)
        elif action == "select":
            self.select(index, value)
        elif action in {"check", "uncheck"}:
            self.check(index, action == "check")
        elif action in {"click", "submit"}:
            self.click(index)
        elif action == "noop":
            pass
        else:
            raise ValueError(f"Unknown action: {action!r}")

    def stop(self) -> None:
        if self._browser:
            self._browser.close()
        if self._pw:
            self._pw.stop()
