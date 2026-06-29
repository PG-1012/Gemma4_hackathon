"use client";

import { Card, CardBody, Chip } from "@heroui/react";
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
          <Card
            key={a.name}
            shadow="none"
            radius="lg"
            className="border bg-content1 transition-all duration-200"
            style={{
              borderColor: active ? a.color : "#2a2a2e",
              boxShadow: active ? `0 0 0 1px ${a.color}, 0 0 22px -8px ${a.color}` : "none",
              opacity: active ? 1 : 0.62,
            }}
          >
            {active && (
              <span
                className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse"
                style={{ background: a.color }}
              />
            )}
            <CardBody className="px-4 py-3">
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
              <Chip
                size="sm"
                variant="flat"
                radius="sm"
                className="mt-1 h-5 px-1.5 text-[10px] uppercase tracking-wide"
                style={{ color: a.color, backgroundColor: `${a.color}1f` }}
              >
                {STATE_LABEL[rt.state]}
              </Chip>
              <div className="mt-1.5 h-9 text-[11px] leading-snug text-slate-400">
                {rt.reasoning ?? a.role}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
