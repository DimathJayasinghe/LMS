"use client";

import { useEffect, useRef } from "react";

interface AutoSubmitOptions {
  /** ISO end of the exam on the server's clock. */
  endTime: string;
  /** How long before the end the browser submits; the server refuses any start after the end. */
  leadSeconds: number;
  /** Milliseconds to add to the device clock to get server time. */
  offsetMs: number;
  /** False until the saved draft has been restored, so a restored answer is not missed. */
  active: boolean;
  /** Return `false` when there was nothing to send yet: it is asked again each second until it returns anything else. */
  onFire: () => boolean | void;
}

/** Calls `onFire` from `leadSeconds` before the end by server time, until it reports the work was handled. */
export function useAutoSubmit({ endTime, leadSeconds, offsetMs, active, onFire }: AutoSubmitOptions): void {
  const fired = useRef(false);
  const latest = useRef(onFire);

  useEffect(() => {
    latest.current = onFire;
  });

  useEffect(() => {
    if (!active) return;
    const fireAt = new Date(endTime).getTime() - leadSeconds * 1000;
    // A one-second poll rather than one long timeout: it survives a throttled background tab and a sleeping phone.
    const check = (): void => {
      if (fired.current || Date.now() + offsetMs < fireAt) return;
      if (latest.current() !== false) fired.current = true;
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [endTime, leadSeconds, offsetMs, active]);
}
