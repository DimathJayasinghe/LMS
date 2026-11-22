"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { McqAnswers } from "@/lib/types";

/** The student's MCQ selections: restored from the last autosave and kept in step across tabs. */
export function useMcqDraft(storageKey: string, initial: McqAnswers) {
  const [mcq, setMcq] = useState<McqAnswers>(initial);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Restore MCQ answers on mount + sync across tabs (prevents the multi-tab
  // overwrite bug for exams — architecture §5.1).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // Hydrate from the last autosave. localStorage is client-only, so this
      // can't move to a lazy initializer without an SSR hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setMcq(JSON.parse(saved) as McqAnswers);
    } catch {
      /* ignore corrupt cache */
    }
    const bc = new BroadcastChannel(storageKey);
    bc.onmessage = (e: MessageEvent<McqAnswers>) => setMcq(e.data);
    channelRef.current = bc;
    return () => bc.close();
  }, [storageKey]);

  const persist = useCallback(
    (next: McqAnswers) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage full / unavailable — non-fatal */
      }
      channelRef.current?.postMessage(next);
    },
    [storageKey],
  );

  const toggleOption = useCallback(
    (questionId: string, optionId: string) => {
      setMcq((prev) => {
        const current = prev[questionId] ?? [];
        const nextForQuestion = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        const next = { ...prev };
        // Drop empty arrays — the API rejects a question with no selections.
        if (nextForQuestion.length === 0) delete next[questionId];
        else next[questionId] = nextForQuestion;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { mcq, toggleOption };
}
