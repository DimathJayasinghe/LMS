import type { McqAnswers } from "@/lib/types";

export type WrittenChannel = "typed" | "pdf";
export interface WrittenPart {
  key: string;
  text: string;
}
export interface WrittenDraft {
  channel: WrittenChannel;
  parts: WrittenPart[];
}

/** A key no existing part uses, so removing a middle part and adding another can never merge two answers into one. */
export function nextPartKey(parts: WrittenPart[]): string {
  const highest = Math.max(0, ...parts.map((p) => Number(/^part-(\d+)$/.exec(p.key)?.[1] ?? 0)));
  return `part-${highest + 1}`;
}

const DRAFT_PREFIX = "exam:";

/** Drafts belong to one student on one exam: a shared device must never hand one student's answers to the next. */
export const examDraftKeys = (userId: string, examId: string) => ({
  mcq: `${DRAFT_PREFIX}${userId}:${examId}:answers`,
  written: `${DRAFT_PREFIX}${userId}:${examId}:written`,
});

/** Reads a stored draft, or null for anything that is not one. */
export function parseWrittenDraft(raw: string | null): WrittenDraft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const { channel, parts } = value as { channel?: unknown; parts?: unknown };
    if (channel !== "typed" && channel !== "pdf") return null;
    if (!Array.isArray(parts) || parts.length === 0) return null;
    if (!parts.every((p) => p && typeof p.key === "string" && typeof p.text === "string")) return null;
    return { channel, parts: parts.map(({ key, text }) => ({ key, text })) };
  } catch {
    return null;
  }
}

/** Storage is best effort: private windows, full disks and blocked site data must never break the exam page. */
export function readWrittenDraft(storageKey: string): WrittenDraft | null {
  try {
    return parseWrittenDraft(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

export function writeWrittenDraft(storageKey: string, draft: WrittenDraft): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    /* storage full or unavailable: the answers still live on the page */
  }
}

export function clearDrafts(...storageKeys: string[]): void {
  for (const key of storageKeys) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Signing out removes every exam draft this device holds, the old unscoped ones included. */
export function clearAllExamDrafts(): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const key of keys) if (key?.startsWith(DRAFT_PREFIX)) localStorage.removeItem(key);
  } catch {
    /* storage unavailable: there is nothing to clear */
  }
}

interface SittingState {
  requiresMcq: boolean;
  requiresWritten: boolean;
  mcq: McqAnswers;
  channel: WrittenChannel;
  parts: WrittenPart[];
  file: File | null;
}

/** True while the student holds work that has not reached the server. */
export function hasUnsentContent({ requiresMcq, requiresWritten, mcq, channel, parts, file }: SittingState): boolean {
  if (requiresMcq && Object.keys(mcq).length > 0) return true;
  if (!requiresWritten) return false;
  return channel === "pdf" ? file !== null : parts.some((p) => p.text.trim() !== "");
}
