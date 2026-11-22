"use client";

import { useEffect, useState } from "react";
import { measureServerOffset } from "@/lib/server-clock";

export const SERVER_CLOCK_REFRESH_MS = 5 * 60 * 1000;

/**
 * Milliseconds to add to `Date.now()` to get server time. It is 0 (the device clock) until the first measurement
 * lands and whenever the server cannot be reached; a failed refresh keeps the last good value.
 */
export function useServerOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const measure = async (): Promise<void> => {
      const next = await measureServerOffset();
      if (!cancelled && next !== null) setOffset(next);
    };
    void measure();
    const id = setInterval(() => void measure(), SERVER_CLOCK_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return offset;
}
