"use client";

import { useEffect, useRef, useState } from "react";

export interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}

/** Tweens between values so a changing figure visibly moves instead of snapping. */
export default function AnimatedNumber({ value, format = (n) => String(Math.round(n)), durationMs = 700 }: AnimatedNumberProps) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      from.current = value;
      return;
    }
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = origin + (value - origin) * eased;
      setShown(current);
      from.current = current;
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{format(shown)}</span>;
}
