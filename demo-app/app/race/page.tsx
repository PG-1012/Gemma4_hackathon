"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Switch, Tabs, Tab } from "@heroui/react";
import { AgentName, AgentEvent } from "@/lib/types/agent-events";
import { Phase } from "@/lib/types/phase";
import { LAYOUT_A, LAYOUT_B, orderedFieldIds } from "@/lib/fields";
import { VISA_LAYOUT_A, VISA_LAYOUT_B } from "@/lib/visa-fields";
import { createSimulator, EventSource } from "@/lib/event-bus/simulator";
import {
  createVisaSimulator,
  createVisaAutoHuman,
  visibleVisaSteps,
} from "@/lib/event-bus/visaSimulator";
import { createAutoHuman } from "@/lib/event-bus/autoHuman";
import { createWsClient } from "@/lib/event-bus/websocket";
import {
  applyFieldAction,
  countFilled,
  fieldRect,
  getDoc,
  isSubmitted,
} from "@/lib/iframe";
import { AgentCards, AgentRuntime } from "@/components/race-ui/AgentCards";
import { Controls } from "@/components/race-ui/Controls";
import { RunnerPane, HighlightBox } from "@/components/race-ui/RunnerPane";
import { StatsPanel } from "@/components/race-ui/StatsPanel";
import { StatusBanner } from "@/components/race-ui/StatusBanner";

const PROVIDER = "Gemma 4 · Cerebras";
const IDLE_AGENTS: Record<AgentName, AgentRuntime> = {
  planner: { state: "idle" },
  executor: { state: "idle" },
  verifier: { state: "idle" },
  recovery: { state: "idle" },
};

export default function RacePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [workflow, setWorkflow] = useState<"expense" | "visa">("expense");
  const [variant, setVariant] = useState<"A" | "B">("A");
  const [resetKey, setResetKey] = useState(0);
  const [agents, setAgents] = useState<Record<AgentName, AgentRuntime>>(IDLE_AGENTS);
  const [aiSteps, setAiSteps] = useState(0);
  const [humanSteps, setHumanSteps] = useState(0);
  const [aiRunning, setAiRunning] = useState(false);
  const [humanRunning, setHumanRunning] = useState(false);
  const [highlight, setHighlight] = useState<HighlightBox | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const [speedup, setSpeedup] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | undefined>();
  const [autoHuman, setAutoHuman] = useState(true);
  const [live, setLive] = useState(false); // drive AI from the real backend (expense only)

  const isVisa = workflow === "visa";
  const layout = variant === "A" ? LAYOUT_A : LAYOUT_B;
  const visaLayout = variant === "A" ? VISA_LAYOUT_A : VISA_LAYOUT_B;
  const total = isVisa
    ? visibleVisaSteps(visaLayout).length
    : orderedFieldIds(layout).length;
  const src = isVisa
    ? variant === "A" ? "/visa-a" : "/visa-b"
    : variant === "A" ? "/form-a" : "/form-b";
  const humanFieldIds = () =>
    isVisa ? visibleVisaSteps(visaLayout).map((s) => s.id) : orderedFieldIds(layout);

  const aiIframe = useRef<HTMLIFrameElement>(null);
  const humanIframe = useRef<HTMLIFrameElement>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const autoHumanRef = useRef<EventSource | null>(null);
  const raceStart = useRef<number>(0);
  const aiFinish = useRef<number | null>(null);
  const humanFinish = useRef<number | null>(null);
  const runId = useRef(0); // invalidates events from a superseded run

  // ---- event handling: drive the AI pane + UI from the stream ----
  const handleEvent = useCallback(
    (ev: AgentEvent) => {
      switch (ev.type) {
        case "race_started":
          raceStart.current = performance.now();
          aiFinish.current = null;
          setAiRunning(true);
          break;
        case "agent_state":
          setAgents((a) => ({ ...a, [ev.agent]: { state: ev.state, reasoning: ev.reasoning } }));
          if (ev.agent === "recovery") setRecovering(ev.state !== "idle");
          break;
        case "field_interaction": {
          const doc = getDoc(aiIframe.current);
          applyFieldAction(doc, ev.fieldId, ev.action, ev.value);
          if (ev.action === "focus") {
            // measure after the smooth scroll settles
            setTimeout(() => {
              const r = fieldRect(getDoc(aiIframe.current), ev.fieldId);
              if (r) setHighlight({ top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 });
            }, 90);
          }
          break;
        }
        case "step_completed":
          setAiSteps(ev.stepNumber);
          break;
        case "recovery_triggered":
          setRecovering(true);
          setDetail(`UI changed — Gemma recovering`);
          break;
        case "race_finished": {
          aiFinish.current = performance.now();
          setAiRunning(false);
          setAiSteps(total);
          setHighlight(null);
          setRecovering(false);
          setCelebrate((c) => c + 1);
          setPhase((p) => (p === "rerunning" ? "rerunFinished" : "finished"));
          const secs = ((aiFinish.current - raceStart.current) / 1000).toFixed(1);
          setDetail(`AI finished in ${secs}s — human still on step ${Math.max(1, humanStepsRef.current)}`);
          break;
        }
      }
    },
    [total],
  );

  // keep a ref of humanSteps for the finish banner
  const humanStepsRef = useRef(0);
  useEffect(() => {
    humanStepsRef.current = humanSteps;
  }, [humanSteps]);

  // ---- live speedup + human progress polling ----
  // Runs while a race is in flight AND after the AI finishes, so the speed
  // advantage keeps climbing while the human is still plodding along.
  useEffect(() => {
    const live =
      phase === "racing" ||
      phase === "rerunning" ||
      phase === "finished" ||
      phase === "rerunFinished";
    if (!live) return;
    const ids = humanFieldIds();
    const interval = setInterval(() => {
      // human progress from the real (or auto) iframe
      const hdoc = getDoc(humanIframe.current);
      const filled = countFilled(hdoc, ids);
      setHumanSteps(filled);
      if (isSubmitted(hdoc) && humanFinish.current == null) {
        humanFinish.current = performance.now();
        setHumanRunning(false);
      }
      // speed advantage = human seconds-per-step ÷ AI seconds-per-step
      const now = performance.now();
      const aiEl = Math.max(((aiFinish.current ?? now) - raceStart.current) / 1000, 0.1);
      const huEl = Math.max(((humanFinish.current ?? now) - raceStart.current) / 1000, 0.1);
      const aiPerStep = aiSteps > 0 ? aiEl / aiSteps : null;
      const huPerStep = filled > 0 ? huEl / filled : null;
      if (aiPerStep && huPerStep && aiSteps >= 3) {
        const ratio = huPerStep / aiPerStep;
        if (ratio > 0) setSpeedup(Math.min(ratio, 25));
      }
    }, 200);
    return () => clearInterval(interval);
  }, [phase, layout, aiSteps]);

  // ---- controls ----
  const stopSources = () => {
    sourceRef.current?.stop();
    autoHumanRef.current?.stop();
    sourceRef.current = null;
    autoHumanRef.current = null;
  };

  const beginRace = (withRecovery: boolean, nextPhase: Phase) => {
    stopSources();
    setResetKey((k) => k + 1); // remount iframes blank + reset timers
    setAgents(IDLE_AGENTS);
    setAiSteps(0);
    setHumanSteps(0);
    setHighlight(null);
    setRecovering(false);
    setDetail(undefined);
    setSpeedup(null);
    aiFinish.current = null;
    humanFinish.current = null;
    runId.current += 1;
    const myRun = runId.current;
    setPhase(nextPhase);
    setHumanRunning(true);
    // wait for the freshly-remounted iframes to load, then start the stream
    // (visa wizard needs a touch longer to mount its 6 pages)
    setTimeout(() => {
      if (runId.current !== myRun) return; // superseded before we even started
      const onEvent = (ev: AgentEvent) => {
        if (runId.current === myRun) handleEvent(ev);
      };
      // Live mode (expense only): drive the AI from the real Gemma backend over
      // WebSocket. Visa + all mutated/rerun flows stay on the local simulator.
      const useLive = live && !isVisa && nextPhase === "racing";
      sourceRef.current = useLive
        ? createWsClient(onEvent)
        : isVisa
        ? createVisaSimulator({ layout: visaLayout, withRecovery, onEvent })
        : createSimulator({ layout, withRecovery, onEvent });
      sourceRef.current.start();
      if (autoHuman) {
        autoHumanRef.current = isVisa
          ? createVisaAutoHuman(humanIframe.current, visaLayout)
          : createAutoHuman(humanIframe.current, layout);
        autoHumanRef.current.start();
      }
    }, isVisa ? 750 : 500);
  };

  const onRecord = () => {
    if (phase === "idle") {
      setPhase("recording");
      // open the form for the currently-selected workflow (expense vs visa)
      window.open(src, "_blank", "noopener,width=900,height=1000");
    } else if (phase === "recording") {
      setPhase("recorded");
    }
  };
  const onCompile = () => {
    setPhase("compiling");
    setTimeout(() => setPhase("ready"), 1600);
  };
  const onRace = () => beginRace(false, "racing");
  const onRerun = () => beginRace(true, "rerunning");
  const onMutate = () => {
    stopSources();
    runId.current += 1;
    setVariant("B");
    setResetKey((k) => k + 1);
    setAgents(IDLE_AGENTS);
    setAiSteps(0);
    setHumanSteps(0);
    setHighlight(null);
    setRecovering(false);
    setAiRunning(false);
    setHumanRunning(false);
    setDetail("UI mutated — fields moved, renamed & regrouped");
    setPhase("mutated");
  };
  const onReset = () => {
    stopSources();
    runId.current += 1;
    setVariant("A");
    setResetKey((k) => k + 1);
    setAgents(IDLE_AGENTS);
    setAiSteps(0);
    setHumanSteps(0);
    setHighlight(null);
    setRecovering(false);
    setAiRunning(false);
    setHumanRunning(false);
    setSpeedup(null);
    setDetail(undefined);
    aiFinish.current = null;
    humanFinish.current = null;
    setPhase("idle");
  };
  const changeWorkflow = (w: "expense" | "visa") => {
    if (w === workflow) return;
    setWorkflow(w);
    onReset(); // switching examples starts fresh
  };

  useEffect(() => () => stopSources(), []);

  return (
    <main className="flex h-screen flex-col gap-3 bg-ink-900 p-4 text-slate-100">
      {/* top bar */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-extrabold tracking-tight">
            ⚡ Flowstate
          </h1>
          <span className="text-[11px] text-slate-500">
            Vision-based RPA · Gemma 4 on Cerebras vs.{" "}
            {isVisa ? "government bureaucracy" : "enterprise paperwork"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            size="sm"
            radius="full"
            aria-label="Workflow"
            selectedKey={workflow}
            onSelectionChange={(k) => changeWorkflow(k as "expense" | "visa")}
            classNames={{ tabList: "bg-ink-800 border border-ink-600" }}
          >
            <Tab key="expense" title="Expense" />
            <Tab key="visa" title="Visa" />
          </Tabs>
          <Switch
            size="sm"
            color="warning"
            isSelected={live}
            isDisabled={isVisa}
            onValueChange={setLive}
            classNames={{ label: "text-[11px] text-slate-400" }}
          >
            live AI
          </Switch>
          <Switch
            size="sm"
            color="success"
            isSelected={autoHuman}
            onValueChange={setAutoHuman}
            classNames={{ label: "text-[11px] text-slate-400" }}
          >
            auto-human
          </Switch>
          <StatusBanner phase={phase} detail={detail} />
        </div>
      </header>

      {/* main: split-screen + stats */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 flex-1 items-stretch gap-3">
          <RunnerPane
            side="human"
            label="Human"
            sublabel="manual entry"
            src={src}
            iframeRef={humanIframe}
            running={humanRunning}
            resetKey={resetKey}
            steps={humanSteps}
            total={total}
          />
          <RunnerPane
            side="ai"
            label="AI"
            sublabel="Gemma 4 · Cerebras"
            src={src}
            iframeRef={aiIframe}
            running={aiRunning}
            resetKey={resetKey}
            steps={aiSteps}
            total={total}
            highlight={highlight}
            celebrate={celebrate}
          />
        </div>
        <div className="w-64 shrink-0">
          <StatsPanel
            speedup={speedup}
            aiSteps={aiSteps}
            humanSteps={humanSteps}
            total={total}
            recovering={recovering}
            provider={PROVIDER}
          />
        </div>
      </div>

      {/* agent reasoning panel */}
      <AgentCards agents={agents} />

      {/* controls */}
      <Controls
        phase={phase}
        onRecord={onRecord}
        onCompile={onCompile}
        onRace={onRace}
        onMutate={onMutate}
        onRerun={onRerun}
        onReset={onReset}
      />
    </main>
  );
}
