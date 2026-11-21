import { describe, expect, it } from "vitest";
import { hallMarkMessage, isBlockingStatus, parseHallMarks } from "./hall-marks";
import type { HallMarkRow, HallMarkRowStatus } from "./types";

describe("parseHallMarks", () => {
  it("reads index and marks separated by a space, comma, semicolon or tab", () => {
    const { rows, errors } = parseHallMarks("101 55\n102,60\n103;70\n104\t80");
    expect(rows).toEqual([
      { indexNumber: 101, marks: 55 },
      { indexNumber: 102, marks: 60 },
      { indexNumber: 103, marks: 70 },
      { indexNumber: 104, marks: 80 },
    ]);
    expect(errors).toEqual([]);
  });

  it("accepts a spreadsheet paste with Windows line endings and blank lines", () => {
    const { rows, errors } = parseHallMarks("101\t55\r\n\r\n  102   60  \r\n");
    expect(rows).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it("accepts zero marks", () => {
    expect(parseHallMarks("101 0").rows).toEqual([{ indexNumber: 101, marks: 0 }]);
  });

  it.each([
    ["a line with one value", "101"],
    ["a line with three values", "101 55 3"],
    ["a text index number", "abc 55"],
    ["a zero index number", "0 55"],
    ["an index number past the database range", "99999999999 55"],
    ["a decimal mark", "101 55.5"],
    ["a negative mark", "101 -5"],
    ["a text mark", "101 absent"],
    ["a header line", "Index Marks"],
  ])("reports %s with its line number and keeps the good lines", (_label, bad) => {
    const { rows, errors } = parseHallMarks(`101 55\n${bad}\n102 60`);
    expect(rows).toEqual([{ indexNumber: 101, marks: 55 }, { indexNumber: 102, marks: 60 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2, text: bad });
    expect(errors[0]!.message).toBeTruthy();
  });

  it("returns nothing for empty input", () => {
    expect(parseHallMarks("  \n \n")).toEqual({ rows: [], errors: [] });
  });
});

describe("isBlockingStatus", () => {
  it.each<[HallMarkRowStatus, boolean]>([
    ["OK", false], ["WILL_CHANGE", false],
    ["UNKNOWN_INDEX", true], ["NOT_ELIGIBLE", true], ["NOT_ASSIGNED", true], ["DUPLICATE_IN_BATCH", true],
    ["OUT_OF_RANGE", true], ["ONLINE_SUBMISSION_EXISTS", true], ["MARKS_SET_BY_TEACHER", true],
  ])("%s blocks a save: %s", (status, blocks) => {
    expect(isBlockingStatus(status)).toBe(blocks);
  });
});

describe("hallMarkMessage", () => {
  const row = (over: Partial<HallMarkRow>): HallMarkRow => ({ line: 1, indexNumber: 101, marks: 55, status: "WILL_CHANGE", ...over });

  it("explains every status", () => {
    const statuses: HallMarkRowStatus[] = ["OK", "WILL_CHANGE", "UNKNOWN_INDEX", "NOT_ELIGIBLE", "NOT_ASSIGNED", "DUPLICATE_IN_BATCH", "OUT_OF_RANGE", "ONLINE_SUBMISSION_EXISTS", "MARKS_SET_BY_TEACHER"];
    for (const status of statuses) expect(hallMarkMessage(row({ status }), 100)).toMatch(/\S/);
  });

  it("shows a change or a new mark", () => {
    expect(hallMarkMessage(row({ before: null, after: 55 }), 100)).toBe("New mark.");
    expect(hallMarkMessage(row({ before: 40, after: 55 }), 100)).toBe("Changes 40 to 55.");
  });

  it("names the allowed range for a bad mark", () => {
    expect(hallMarkMessage(row({ status: "OUT_OF_RANGE" }), 80)).toContain("0 to 80");
  });
});
