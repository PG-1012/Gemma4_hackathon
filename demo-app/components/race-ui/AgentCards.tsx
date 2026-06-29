"use client";

import { AgentName, AgentState } from "@/lib/types/agent-events";

const AGENTS: { name: AgentName; title: string; role: string; color: string }[] = [
  { name: "planner", title: "Planner", role: "Chooses next sub-goal", color: "#6366f1" },
  { name: "executor", title: "Executor", role: "Vision → action", color: "#06b6d4" },
  { name: "verifier", title: "Verifier", role: "Confirms outcome", color: "#22c55e" },
  { name: "recovery", title: "Recovery", role: "Handles failures", color: "#f59e0b" },
];

export interface AgentRuntime {
  state: AgentState;
  reasoning?: string;
}

const STATE_LABEL: Record<AgentState, string> = {
  idle: "idle",
  thinking: "thinking",
  acting: "acting",
};

export function AgentCards({
  agents,
}: {
  agents: Record<AgentName, AgentRuntime>;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {AGENTS.map((a) => {
        const rt = agents[a.name];
        const active = rt.state !== "idle";
        return (
          <div
            key={a.name}
            className="relative overflow-hidden rounded-xl border bg-ink-800 px-4 py-3 transition-all duration-200"
            style={{
              borderColor: active ? a.color : "#1e2638",
              boxShadow: active ? `0 0 0 1px ${a.color}, 0 0 22px -8px ${a.color}` : "none",
              opacity: active ? 1 : 0.62,
            }}
          >
            {active && (
              <span
                className="absolute inset-x-0 top-0 h-0.5 animate-pulse"
                style={{ background: a.color }}
              />
            )}
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-white">{a.title}</span>
              <span
                className="inline-flex h-2 w-2 rounded-full"
                style={{
                  background: a.color,
                  animation: active ? "hl-pulse 1s ease-in-out infinite" : "none",
                  opacity: active ? 1 : 0.4,
                }}
              />
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: a.color }}>
              {STATE_LABEL[rt.state]}
            </div>
            <div className="mt-1.5 h-9 text-[11px] leading-snug text-slate-400">
              {rt.reasoning ?? a.role}
            </div>
          </div>
        );
      })}
    </div>
  );
}
