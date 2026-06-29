"use client";

import { Button } from "@heroui/react";
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
      <Button
        data-testid="ctl-record"
        color="danger"
        variant="shadow"
        isDisabled={!can.record}
        onPress={onRecord}
      >
        {recordLabel}
      </Button>
      <Button
        data-testid="ctl-compile"
        color="secondary"
        variant="flat"
        isDisabled={!can.compile}
        onPress={onCompile}
      >
        Compile
      </Button>
      <Button
        data-testid="ctl-race"
        color="primary"
        variant="shadow"
        isDisabled={!can.race}
        onPress={onRace}
      >
        ▶ Race
      </Button>

      <div className="mx-1 h-7 w-px bg-ink-500" />

      <Button
        data-testid="ctl-mutate"
        color="warning"
        variant="flat"
        isDisabled={!can.mutate}
        onPress={onMutate}
      >
        ⤬ Mutate UI
      </Button>
      <Button
        data-testid="ctl-rerun"
        color="primary"
        variant="bordered"
        isDisabled={!can.rerun}
        onPress={onRerun}
      >
        ↻ Rerun AI
      </Button>

      <div className="flex-1" />

      <Button
        data-testid="ctl-reset"
        variant="light"
        isDisabled={!can.reset}
        onPress={onReset}
      >
        Reset
      </Button>
    </div>
  );
}
