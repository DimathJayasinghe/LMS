import { describe, expect, it } from "vitest";
import { consoleDay, consoleDayTime, consoleTime, plural } from "./console-format";

describe("console times", () => {
  it("show Colombo time, not the server's or the UTC one", () => {
    expect(consoleTime("2026-11-20T03:30:00Z")).toMatch(/^9:00\s?am$/i);
    expect(consoleTime("2026-11-19T20:00:00Z")).toMatch(/^1:30\s?am$/i);
  });

  it("show the Colombo day the instant falls on", () => {
    expect(consoleDay("2026-11-19T20:00:00Z")).toBe("Nov 20");
    expect(consoleDayTime("2026-11-19T20:00:00Z")).toMatch(/^Nov 20, 1:30\s?am$/i);
  });
});

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "exam")).toBe("1 exam");
    expect(plural(0, "exam")).toBe("0 exams");
    expect(plural(2, "exam")).toBe("2 exams");
    expect(plural(3, "class", "classes")).toBe("3 classes");
  });
});
