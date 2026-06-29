"use client";

import { Phase } from "@/lib/types/phase";

interface ControlsProps {
  phase: Phase;
  onRecord: () => void;
  onCompile: () => void;
  onRace: () => void;
  onMutate: () => void;
  onRerun: () => void;
  onReset: () => void;
}

export function Controls({
  phase,
  onRecord,
  onCompile,
  onRace,
  onMutate,
  onRerun,
  onReset,
}: ControlsProps) {
  const running = phase === "racing" || phase === "rerunning" || phase === "compiling";
  const can = {
    record: phase === "idle" || phase === "recording",
    compile: phase === "recorded",
    race: phase === "ready",
    mutate: phase === "finished",
    rerun: phase === "mutated" || phase === "rerunFinished",
    reset: !running,
  };
  const recordLabel = phase === "recording" ? "■ Stop recording" : "● Record";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Btn testid="record" label={recordLabel} onClick={onRecord} enabled={can.record} variant="record" />
      <Btn testid="compile" label="Compile" onClick={onCompile} enabled={can.compile} variant="step" />
      <Btn testid="race" label="▶ Race" onClick={onRace} enabled={can.race} variant="primary" />
      <div className="mx-1 h-7 w-px bg-ink-500" />
      <Btn testid="mutate" label="⤬ Mutate UI" onClick={onMutate} enabled={can.mutate} variant="warn" />
      <Btn testid="rerun" label="↻ Rerun AI" onClick={onRerun} enabled={can.rerun} variant="primary" />
      <div className="flex-1" />
      <Btn testid="reset" label="Reset" onClick={onReset} enabled={can.reset} variant="ghost" />
    </div>
  );
}

function Btn({
  label,
  onClick,
  enabled,
  variant,
  testid,
}: {
  label: string;
  onClick: () => void;
  enabled: boolean;
  variant: "primary" | "step" | "record" | "warn" | "ghost";
  testid: string;
}) {
  const base =
    "rounded-lg px-4 py-2.5 text-[13px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-35";
  const styles: Record<string, string> = {
    primary: "bg-ai text-ink-900 hover:brightness-110",
    step: "bg-executor text-white hover:brightness-110",
    record: "bg-rose-500 text-white hover:brightness-110",
    warn: "bg-recovery text-ink-900 hover:brightness-110",
    ghost: "border border-ink-500 text-slate-300 hover:bg-ink-700",
  };
  return (
    <button
      data-testid={`ctl-${testid}`}
      disabled={!enabled}
      onClick={onClick}
      className={`${base} ${styles[variant]}`}
    >
      {label}
    </button>
  );
}
