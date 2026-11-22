import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllExamDrafts, clearDrafts, examDraftKeys, hasUnsentContent, nextPartKey, parseWrittenDraft, readWrittenDraft, writeWrittenDraft,
} from "./exam-draft";

const KEY = "exam:e1:written";
const draft = { channel: "typed" as const, parts: [{ key: "part-1", text: "My answer" }, { key: "part-2", text: "" }] };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("written draft storage", () => {
  it("round-trips the channel and the typed parts", () => {
    writeWrittenDraft(KEY, draft);
    expect(readWrittenDraft(KEY)).toEqual(draft);
  });

  it("reads nothing when nothing was saved", () => {
    expect(readWrittenDraft(KEY)).toBeNull();
  });

  it.each(["{not json", "null", "42", '{"channel":"fax","parts":[]}', '{"channel":"typed","parts":"x"}', '{"channel":"typed","parts":[{"key":1,"text":"a"}]}', '{"channel":"typed","parts":[]}'])(
    "ignores a corrupt draft %s",
    (raw) => {
      localStorage.setItem(KEY, raw);
      expect(readWrittenDraft(KEY)).toBeNull();
    },
  );

  it("does not throw when storage is unavailable for reading", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    expect(readWrittenDraft(KEY)).toBeNull();
  });

  it("does not throw when storage is full or unavailable for writing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => writeWrittenDraft(KEY, draft)).not.toThrow();
  });

  it("clears every key it is given and tolerates a failure", () => {
    localStorage.setItem("a", "1");
    localStorage.setItem("b", "2");
    clearDrafts("a", "b");
    expect(localStorage.getItem("a")).toBeNull();
    expect(localStorage.getItem("b")).toBeNull();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => clearDrafts("a")).not.toThrow();
  });
});

describe("hasUnsentContent", () => {
  const base = { requiresMcq: false, requiresWritten: true, mcq: {}, channel: "typed" as const, parts: [{ key: "p", text: "" }], file: null };

  it("is false when nothing is typed or chosen", () => {
    expect(hasUnsentContent(base)).toBe(false);
    expect(hasUnsentContent({ ...base, parts: [{ key: "p", text: "   \n" }] })).toBe(false);
  });

  it("is true for typed text on the typed channel", () => {
    expect(hasUnsentContent({ ...base, parts: [{ key: "p", text: "a" }] })).toBe(true);
  });

  it("ignores typed text when the PDF channel is chosen, and needs a file there", () => {
    const typedButPdf = { ...base, channel: "pdf" as const, parts: [{ key: "p", text: "a" }] };
    expect(hasUnsentContent(typedButPdf)).toBe(false);
    expect(hasUnsentContent({ ...typedButPdf, file: new File(["x"], "a.pdf") })).toBe(true);
  });

  it("is true for an MCQ selection on an exam that asks for MCQ", () => {
    expect(hasUnsentContent({ ...base, requiresMcq: true, requiresWritten: false, mcq: { q1: ["a"] } })).toBe(true);
    expect(hasUnsentContent({ ...base, requiresMcq: true, requiresWritten: false, mcq: {} })).toBe(false);
  });

  it("does not count written work on an MCQ-only exam", () => {
    expect(hasUnsentContent({ ...base, requiresMcq: true, requiresWritten: false, parts: [{ key: "p", text: "a" }] })).toBe(false);
  });
});

describe("nextPartKey", () => {
  it("numbers the next part after the highest one", () => {
    expect(nextPartKey([{ key: "part-1", text: "" }])).toBe("part-2");
  });

  it("never reuses a key after a middle part was removed", () => {
    expect(nextPartKey([{ key: "part-1", text: "" }, { key: "part-3", text: "" }])).toBe("part-4");
  });

  it("starts at part-1 when nothing is left", () => {
    expect(nextPartKey([])).toBe("part-1");
  });
});

describe("draft keys", () => {
  it("are scoped to the student and the exam, so a shared device never mixes students", () => {
    expect(examDraftKeys("u1", "e1")).toEqual({ mcq: "exam:u1:e1:answers", written: "exam:u1:e1:written" });
    expect(examDraftKeys("u2", "e1").written).not.toBe(examDraftKeys("u1", "e1").written);
  });
});

describe("parseWrittenDraft", () => {
  it("reads a stored draft and rejects null, junk and the wrong shape", () => {
    expect(parseWrittenDraft(JSON.stringify(draft))).toEqual(draft);
    expect(parseWrittenDraft(null)).toBeNull();
    expect(parseWrittenDraft("{not json")).toBeNull();
    expect(parseWrittenDraft(JSON.stringify({ channel: "typed", parts: [{ key: 1, text: "x" }] }))).toBeNull();
  });
});

describe("clearAllExamDrafts", () => {
  it("removes every exam draft, including the old unscoped ones, and nothing else", () => {
    localStorage.setItem("exam:u1:e1:written", "a");
    localStorage.setItem("exam:u2:e9:answers", "b");
    localStorage.setItem("exam:e1:answers", "old");
    localStorage.setItem("theme", "light");
    clearAllExamDrafts();
    expect(localStorage.getItem("exam:u1:e1:written")).toBeNull();
    expect(localStorage.getItem("exam:u2:e9:answers")).toBeNull();
    expect(localStorage.getItem("exam:e1:answers")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    expect(() => clearAllExamDrafts()).not.toThrow();
  });
});
