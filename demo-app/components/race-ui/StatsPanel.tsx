"use client";

import { Card, CardBody, Progress, Chip, Divider } from "@heroui/react";

export function StatsPanel({
  speedup,
  aiSteps,
  humanSteps,
  total,
  recovering,
  provider,
}: {
  speedup: number | null;
  aiSteps: number;
  humanSteps: number;
  total: number;
  recovering: boolean;
  provider: string;
}) {
  return (
    <Card shadow="none" radius="lg" className="border border-ink-600 bg-content1">
      <CardBody className="flex flex-col gap-4 p-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Speed advantage</div>
          <div className="mt-1 font-mono text-4xl font-extrabold tabular-nums text-ai">
            {speedup ? `${speedup.toFixed(1)}×` : "—"}
          </div>
          <div className="text-[11px] text-slate-500">AI vs. human, live</div>
        </div>

        <Divider className="bg-ink-600" />

        <StatRow label="AI" value={`${aiSteps} / ${total}`} pct={aiSteps / total} color="primary" />
        <StatRow label="Human" value={`${humanSteps} / ${total}`} pct={humanSteps / total} color="default" />

        <Divider className="bg-ink-600" />

        <Chip
          variant="flat"
          radius="md"
          color={recovering ? "warning" : "default"}
          classNames={{
            base: `w-full max-w-full justify-start ${recovering ? "" : "bg-ink-700/40"}`,
            content: "text-[12px] font-medium",
          }}
        >
          {recovering ? "⟳ UI changed — Gemma recovering" : "Status nominal"}
        </Chip>

        <div className="text-[11px] text-slate-500">
          Engine: <span className="text-ai">{provider}</span>
        </div>
      </CardBody>
    </Card>
  );
}

function StatRow({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: "primary" | "default";
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono tabular-nums text-slate-200">{value}</span>
      </div>
      <Progress
        aria-label={`${label} progress`}
        value={Math.min(100, pct * 100)}
        size="sm"
        radius="full"
        color={color}
        className="mt-1"
        classNames={{ track: "bg-ink-600" }}
      />
    </div>
  );
}
