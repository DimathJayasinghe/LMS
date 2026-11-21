import type { CashRow } from "@/lib/types";

/** The calendar day (YYYY-MM-DD) it is now in the organization's zone. */
export function dayInTimezone(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** "Matches", "Short Rs 1" or "Over Rs 100" for a count's difference (negative means short). */
export function varianceLabel(variance: string, format: (amount: number) => string): string {
  const value = Number(variance);
  if (!Number.isFinite(value) || value === 0) return "Matches";
  return `${value < 0 ? "Short" : "Over"} ${format(Math.abs(value))}`;
}

export interface CashSummary {
  amount: number;
  payments: number;
  /** Days with cash that nobody has counted yet. */
  uncounted: number;
}

/** Totals for the "Today's cash" strip. */
export function summarizeCash(rows: CashRow[]): CashSummary {
  return {
    amount: rows.reduce((sum, row) => sum + Number(row.amount), 0),
    payments: rows.reduce((sum, row) => sum + row.paymentCount, 0),
    uncounted: rows.filter((row) => row.paymentCount > 0 && !row.tally).length,
  };
}
