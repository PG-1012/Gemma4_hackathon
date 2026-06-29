/** Demo flow state machine phases (record → compile → race → mutate → rerun). */
export type Phase =
  | "idle"
  | "recording"
  | "recorded"
  | "compiling"
  | "ready"
  | "racing"
  | "finished"
  | "mutated"
  | "rerunning"
  | "rerunFinished";
