"use client";

import { RefObject } from "react";
import { Timer } from "./Timer";
import { Confetti } from "./Confetti";

export interface HighlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function RunnerPane({
  side,
  label,
  sublabel,
  src,
  iframeRef,
  running,
  resetKey,
  steps,
  total,
  highlight,
  celebrate = 0,
  onLoad,
}: {
  side: "human" | "ai";
  label: string;
  sublabel?: string;
  src: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  running: boolean;
  resetKey: number;
  steps: number;
  total: number;
  highlight?: HighlightBox | null;
  celebrate?: number;
  onLoad?: () => void;
}) {
  const accent = side === "ai" ? "#00e5a0" : "#cbd5e1";
  const isAi = side === "ai";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-ink-800"
      style={{ borderColor: isAi ? "rgba(0,229,160,0.35)" : "#1e2638" }}
    >
      {/* header: label + timer + step counter */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-widest"
            style={{
              color: isAi ? "#04140f" : "#0a0e16",
              background: accent,
            }}
          >
            {label}
          </span>
          {sublabel && <span className="text-[11px] text-slate-400">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[12px] tabular-nums text-slate-400">
            step {Math.min(steps, total)} / {total}
          </span>
          <Timer running={running} resetKey={resetKey} accent={accent} />
        </div>
      </div>

      {/* iframe + overlay */}
      <div className="relative min-h-0 flex-1">
        <iframe
          ref={iframeRef}
          src={src}
          title={`${label} form`}
          onLoad={onLoad}
          className="h-full w-full border-0 bg-white"
        />
        {isAi && highlight && (
          <div
            className="field-highlight pulsing"
            style={{
              top: highlight.top,
              left: highlight.left,
              width: highlight.width,
              height: highlight.height,
            }}
          />
        )}
        {isAi && <Confetti trigger={celebrate} />}
      </div>
    </div>
  );
}
