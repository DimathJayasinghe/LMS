import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { dayName, readHandoverBlock } from "./handover";

const failure = (code: string, details: unknown) => new ApiError(409, "blocked", code, undefined, undefined, details);

describe("readHandoverBlock", () => {
  it("reads the classes that need a new teacher", () => {
    const courses = [{ id: "c1", name: "Physics" }];
    expect(readHandoverBlock(failure("TEACHER_HAS_CLASSES", { courses, markerAllocations: [] }))).toEqual({ kind: "classes", courses });
  });

  it("reads the marking that stops a marker leaving", () => {
    const allocations = [{ examId: "e1", examTitle: "Term test", courseName: "Physics" }];
    expect(readHandoverBlock(failure("MARKER_HAS_ALLOCATIONS", { courses: [], markerAllocations: allocations }))).toEqual({ kind: "marking", allocations });
  });

  it("reads the timetable clashes of a chosen teacher", () => {
    const conflicts = [{ courseName: "Physics" }];
    expect(readHandoverBlock(failure("HANDOVER_SLOT_CONFLICT", { conflicts }))).toEqual({ kind: "clash", conflicts });
  });

  it.each([
    ["an unrelated error code", failure("LAST_OWNER", { courses: [] })],
    ["a hand-over code without its list", failure("TEACHER_HAS_CLASSES", undefined)],
    ["something that is not an API error", new Error("boom")],
    ["nothing", null],
  ])("answers null for %s", (_name, error) => {
    expect(readHandoverBlock(error)).toBeNull();
  });
});

describe("dayName", () => {
  it("names the weekday, Sunday first", () => {
    expect(dayName(0)).toBe("Sunday");
    expect(dayName(1)).toBe("Monday");
    expect(dayName(9)).toBe("");
  });
});
