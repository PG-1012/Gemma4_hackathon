"use client";

import { useEffect, useRef, useState } from "react";

/** Monospaced count-up timer. Runs while `running`, freezes when stopped. */
export function Timer({
  running,
  resetKey,
  accent = "#cbd5e1",
}: {
  running: boolean;
  resetKey: number; // change to reset to 0
  accent?: string;
}) {
  const [ms, setMs] = useState(0);
  const startRef = useRef<number | null>(null);
  const baseRef = useRef(0);
  const raf = useRef<number | null>(null);

  // reset
  useEffect(() => {
    setMs(0);
    baseRef.current = 0;
    startRef.current = null;
  }, [resetKey]);

  useEffect(() => {
    if (running) {
      startRef.current = performance.now();
      const tick = () => {
        if (startRef.current != null) {
          setMs(baseRef.current + (performance.now() - startRef.current));
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      return () => {
        if (raf.current) cancelAnimationFrame(raf.current);
        if (startRef.current != null) {
          baseRef.current += performance.now() - startRef.current;
          startRef.current = null;
        }
      };
    }
  }, [running]);

  const secs = (ms / 1000).toFixed(1);
  return (
    <div
      className="font-mono text-4xl font-bold tabular-nums tracking-tight"
      style={{ color: accent }}
    >
      {secs}
      <span className="text-lg font-semibold opacity-60">s</span>
    </div>
  );
}
