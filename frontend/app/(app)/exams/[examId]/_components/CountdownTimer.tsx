"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { formatRemaining } from "@/lib/exam";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  /** ISO target instant. Countdown is purely visual — the server enforces the deadline. */
  target: string;
  /** Fired once when the countdown reaches zero. */
  onExpire?: () => void;
  className?: string;
}

export function CountdownTimer({ target, onExpire, className }: CountdownTimerProps) {
  const end = new Date(target).getTime();
  const [remaining, setRemaining] = useState<number>(() => end - Date.now());
  const expired = useRef(false);

  useEffect(() => {
    const tick = (): void => {
      const r = end - Date.now();
      setRemaining(r);
      if (r <= 0 && !expired.current) {
        expired.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [end, onExpire]);

  const urgent = remaining <= 60_000;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono tabular-nums",
        urgent ? "text-destructive" : "text-foreground",
        className,
      )}
    >
      <Timer className="size-4" aria-hidden />
      <span>{formatRemaining(remaining)}</span>
    </span>
  );
}
