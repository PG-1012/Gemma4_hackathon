"use client";

import { Phase } from "@/lib/types/phase";

const TEXT: Record<Phase, string> = {
  idle: "Ready to race",
  recording: "Recording demonstration…",
  recorded: "Demonstration captured",
  compiling: "Compiling workflow…",
  ready: "Ready to race",
  racing: "Racing",
  finished: "AI finished",
  mutated: "UI mutated — testing agent adaptation",
  rerunning: "Racing on mutated UI",
  rerunFinished: "AI adapted to the new layout",
};

const ACCENT: Partial<Record<Phase, string>> = {
  racing: "#00e5a0",
  rerunning: "#00e5a0",
  finished: "#00e5a0",
  rerunFinished: "#00e5a0",
  mutated: "#f59e0b",
  compiling: "#06b6d4",
  recording: "#6366f1",
};

export function StatusBanner({
  phase,
  detail,
}: {
  phase: Phase;
  detail?: string;
}) {
  const accent = ACCENT[phase] ?? "#94a3b8";
  const live = phase === "racing" || phase === "rerunning";
  return (
    <div className="flex items-center gap-3 rounded-full border border-ink-600 bg-ink-800 px-4 py-2">
      <span
        className="inline-flex h-2.5 w-2.5 rounded-full"
        style={{
          background: accent,
          animation: live ? "hl-pulse 1s ease-in-out infinite" : "none",
        }}
      />
      <span className="text-[13px] font-semibold" style={{ color: accent }}>
        {detail ?? TEXT[phase]}
      </span>
    </div>
  );
}
