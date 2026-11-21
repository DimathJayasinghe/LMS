import type { HallMarkRow, HallMarkRowStatus } from "@/lib/types";

export interface ParsedHallMarks {
  rows: { indexNumber: number; marks: number }[];
  errors: { line: number; text: string; message: string }[];
}

/**
 * Reads the pasted list: one student per line, the index number then the marks, separated by spaces, a comma or a tab
 * (so a two-column paste from a spreadsheet works). Blank lines are skipped. Marks are whole numbers because the
 * server stores them as integers; the server still re-checks everything.
 */
export function parseHallMarks(text: string): ParsedHallMarks {
  const rows: ParsedHallMarks["rows"] = [];
  const errors: ParsedHallMarks["errors"] = [];

  text.split(/\r?\n/).forEach((raw, position) => {
    const line = position + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    const parts = trimmed.split(/[\s,;]+/).filter(Boolean);
    if (parts.length !== 2) {
      errors.push({ line, text: trimmed, message: "Write the index number, then the marks." });
      return;
    }
    const [index, marks] = parts as [string, string];
    if (!/^\d+$/.test(index) || Number(index) < 1 || Number(index) > 2147483647) {
      errors.push({ line, text: trimmed, message: "The index number must be a whole number." });
      return;
    }
    if (!/^\d+$/.test(marks)) {
      errors.push({ line, text: trimmed, message: "Marks must be a whole number, 0 or more." });
      return;
    }
    rows.push({ indexNumber: Number(index), marks: Number(marks) });
  });

  return { rows, errors };
}

/** Statuses that stop a save. `OK` (no change) and `WILL_CHANGE` do not. */
export function isBlockingStatus(status: HallMarkRowStatus): boolean {
  return status !== "OK" && status !== "WILL_CHANGE";
}

/** Plain-language explanation of a row, for the checked list. */
export function hallMarkMessage(row: HallMarkRow, totalMarks: number): string {
  switch (row.status) {
    case "OK":
      return "Already saved with these marks.";
    case "WILL_CHANGE":
      return row.before === null || row.before === undefined ? "New mark." : `Changes ${row.before} to ${row.after}.`;
    case "UNKNOWN_INDEX":
      return "No student with this index number in this class.";
    case "NOT_ELIGIBLE":
      return "This student is not sitting this paper in the hall.";
    case "NOT_ASSIGNED":
      return "You are not assigned to mark this student's group.";
    case "DUPLICATE_IN_BATCH":
      return "This index number is listed more than once.";
    case "OUT_OF_RANGE":
      return `Marks must be a whole number from 0 to ${totalMarks}.`;
    case "ONLINE_SUBMISSION_EXISTS":
      return "This student already submitted online. Grade it from the list below.";
    case "MARKS_SET_BY_TEACHER":
      return "A teacher or the owner already set different marks.";
  }
}
