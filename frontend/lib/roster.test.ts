import { describe, expect, it } from "vitest";
import { canViewRoster, rosterPageOf } from "./roster";

describe("canViewRoster", () => {
  it.each(["TEACHER", "ADMIN", "SUPER_ADMIN"] as const)("is true for %s", (role) => {
    expect(canViewRoster(role)).toBe(true);
  });
  it.each(["MARKER", "STUDENT"] as const)("is false for %s", (role) => {
    expect(canViewRoster(role)).toBe(false);
  });
});

describe("rosterPageOf", () => {
  it.each([["2", 2], ["15", 15], [["3", "9"], 3]])("reads %j as page %i", (raw, page) => {
    expect(rosterPageOf(raw)).toBe(page);
  });
  it.each([undefined, "", "0", "-1", "1.5", "abc", "2x", "1e3", "9999999", [], [""]])("falls back to page 1 for %j", (raw) => {
    expect(rosterPageOf(raw)).toBe(1);
  });
});
