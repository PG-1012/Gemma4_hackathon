"use client";

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
    <div className="flex flex-col gap-4 rounded-xl border border-ink-600 bg-ink-800 p-5">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500">Speed advantage</div>
        <div className="mt-1 font-mono text-4xl font-extrabold tabular-nums text-ai">
          {speedup ? `${speedup.toFixed(1)}×` : "—"}
        </div>
        <div className="text-[11px] text-slate-500">AI vs. human, live</div>
      </div>

      <div className="h-px bg-ink-600" />

      <StatRow label="AI" value={`${aiSteps} / ${total}`} color="#00e5a0" pct={aiSteps / total} />
      <StatRow label="Human" value={`${humanSteps} / ${total}`} color="#cbd5e1" pct={humanSteps / total} />

      <div className="h-px bg-ink-600" />

      <div
        className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition-all ${
          recovering
            ? "border-recovery/50 bg-recovery/10 text-recovery"
            : "border-ink-600 bg-ink-700/40 text-slate-500"
        }`}
      >
        {recovering ? "⟳ UI changed — Gemma recovering" : "Status nominal"}
      </div>

      <div className="text-[11px] text-slate-500">
        Engine: <span className="text-ai">{provider}</span>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
  pct,
}: {
  label: string;
  value: string;
  color: string;
  pct: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono tabular-nums text-slate-200">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-600">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, pct * 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}
