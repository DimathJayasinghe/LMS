import { describe, expect, it } from "vitest";
import { reminderSummary, selectableIds } from "./outstanding";
import type { OutstandingRow } from "./types";

const row = (over: Partial<OutstandingRow> = {}): OutstandingRow => ({
  enrollmentId: "e1", studentId: "s1", studentName: "Nimal", indexNumber: 1, phone: null, courseId: "c1", courseName: "Physics",
  classType: "PHYSICAL", monthsOwed: 1, amount: "1500.00", totalOwed: "1500.00", inGrace: false, graceUntil: null, ...over,
});

describe("reminderSummary", () => {
  it("says how many were sent", () => {
    expect(reminderSummary({ sent: 1, skipped: [] })).toBe("1 reminder sent.");
    expect(reminderSummary({ sent: 12, skipped: [] })).toBe("12 reminders sent.");
  });

  it("explains each kind of skip in plain words", () => {
    const text = reminderSummary({
      sent: 2,
      skipped: [
        { enrollmentId: "a", reason: "IN_GRACE" },
        { enrollmentId: "b", reason: "IN_GRACE" },
        { enrollmentId: "c", reason: "REMINDER_LIMIT_REACHED" },
        { enrollmentId: "d", reason: "NOT_OWING" },
      ],
    });
    expect(text).toBe("2 reminders sent. Left out: 2 still in the grace days, 1 already reminded this month, 1 no longer owing.");
  });

  it("handles a run that sent nothing", () => {
    expect(reminderSummary({ sent: 0, skipped: [{ enrollmentId: "a", reason: "REMINDER_LIMIT_REACHED" }] })).toBe(
      "No reminders sent. Left out: 1 already reminded this month.",
    );
  });
});

describe("selectableIds", () => {
  it("leaves out students still inside the grace days, who are never reminded", () => {
    expect(selectableIds([row(), row({ enrollmentId: "e2", inGrace: true }), row({ enrollmentId: "e3" })])).toEqual(["e1", "e3"]);
  });
});
