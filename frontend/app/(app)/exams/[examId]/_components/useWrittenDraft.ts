"use client";

import { useCallback, useEffect, useState } from "react";
import {
  parseWrittenDraft,
  readWrittenDraft,
  writeWrittenDraft,
  type WrittenChannel,
  type WrittenDraft,
  type WrittenPart,
} from "@/lib/exam-draft";

interface WrittenDraftOptions {
  storageKey: string;
  allowTyped: boolean;
  allowPdf: boolean;
}

/**
 * The typed answers and the chosen answer method, kept on the device as they change and kept in step with any other
 * tab of the same exam. `hydrated` turns true once a saved draft has been read, and nothing is written before that,
 * so the empty first render never replaces a draft.
 */
export function useWrittenDraft({ storageKey, allowTyped, allowPdf }: WrittenDraftOptions) {
  const [channel, setChannel] = useState<WrittenChannel>(allowTyped ? "typed" : "pdf");
  const [parts, setParts] = useState<WrittenPart[]>([{ key: "part-1", text: "" }]);
  const [hydrated, setHydrated] = useState(false);

  const adopt = useCallback(
    (draft: WrittenDraft): void => {
      if (draft.channel === "typed" ? allowTyped : allowPdf) setChannel(draft.channel);
      setParts(draft.parts);
    },
    [allowTyped, allowPdf],
  );

  // localStorage is client-only, so the restore cannot move into the initial state without an SSR hydration mismatch.
  useEffect(() => {
    const saved = readWrittenDraft(storageKey);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved) adopt(saved);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey, adopt]);

  // Every tab of an exam submits at the same moment, so a tab that missed the other's typing would send the older text.
  // A cleared or unreadable draft is ignored: the other tab emptying its storage after a submit must not wipe this one.
  useEffect(() => {
    const follow = (event: StorageEvent): void => {
      if (event.key !== storageKey) return;
      const draft = parseWrittenDraft(event.newValue);
      if (draft) adopt(draft);
    };
    window.addEventListener("storage", follow);
    return () => window.removeEventListener("storage", follow);
  }, [storageKey, adopt]);

  useEffect(() => {
    if (hydrated) writeWrittenDraft(storageKey, { channel, parts });
  }, [hydrated, storageKey, channel, parts]);

  return { channel, setChannel, parts, setParts, hydrated };
}
