"use client";

import { useEffect, useRef, useState } from "react";

// Counts from the previous value to the new one, and shows the change for a few seconds.
export function AnimatedScore({ value, className = "" }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState(0);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 1400);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- announces the change, then animates to it
    setDelta(value - start);
    raf = requestAnimationFrame(tick);
    const hide = setTimeout(() => setDelta(0), 4500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hide);
      from.current = value;
    };
  }, [value]);

  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`tabular inline-block transition-transform duration-500 ${delta ? "scale-110" : ""} ${className}`}>{shown}</span>
      {delta !== 0 && (
        <span className={`tabular text-[15px] font-semibold ${delta > 0 ? "text-good" : "text-critical"}`}>
          {delta > 0 ? "+" : "−"}
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}
