import type { OutstandingRow, ReminderResult, ReminderSkipReason } from "@/lib/types";

const SKIP_TEXT: Record<ReminderSkipReason, string> = {
  IN_GRACE: "still in the grace days",
  REMINDER_LIMIT_REACHED: "already reminded this month",
  NOT_OWING: "no longer owing",
};

/** One plain sentence for the toast after sending reminders. */
export function reminderSummary(result: ReminderResult): string {
  const head = result.sent === 0 ? "No reminders sent." : `${result.sent} reminder${result.sent === 1 ? "" : "s"} sent.`;
  const counts = new Map<ReminderSkipReason, number>();
  for (const s of result.skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  if (counts.size === 0) return head;
  const parts = (Object.keys(SKIP_TEXT) as ReminderSkipReason[]).filter((r) => counts.has(r)).map((r) => `${counts.get(r)} ${SKIP_TEXT[r]}`);
  return `${head} Left out: ${parts.join(", ")}.`;
}

/** Rows a clerk can tick: students inside the grace days are never reminded. */
export function selectableIds(rows: OutstandingRow[]): string[] {
  return rows.filter((r) => !r.inGrace).map((r) => r.enrollmentId);
}
