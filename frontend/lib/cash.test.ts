import { describe, expect, it } from "vitest";
import { dayInTimezone, summarizeCash, varianceLabel } from "./cash";
import type { CashRow } from "./types";

const money = (n: number) => `Rs ${n}`;
const row = (over: Partial<CashRow> = {}): CashRow => ({
  day: "2026-11-20", collectorId: "c1", collectorName: "Nimal", instituteId: null, instituteName: null,
  amount: "7500.00", paymentCount: 3, tally: null, ...over,
});

describe("dayInTimezone", () => {
  it("turns the day over at Colombo midnight, not UTC", () => {
    expect(dayInTimezone("Asia/Colombo", new Date("2026-11-20T18:29:00Z"))).toBe("2026-11-20");
    expect(dayInTimezone("Asia/Colombo", new Date("2026-11-20T18:40:00Z"))).toBe("2026-11-21");
  });
});

describe("varianceLabel", () => {
  it("says short, over or matches", () => {
    expect(varianceLabel("-1.00", money)).toBe("Short Rs 1");
    expect(varianceLabel("100.50", money)).toBe("Over Rs 100.5");
    expect(varianceLabel("0.00", money)).toBe("Matches");
  });

  it("does not claim a mismatch it cannot read", () => {
    expect(varianceLabel("", money)).toBe("Matches");
  });
});

describe("summarizeCash", () => {
  it("adds up the cash and counts days still waiting for a count", () => {
    const counted = row({ tally: { id: "t", countedAmount: "7500.00", systemAmount: "7500.00", variance: "0.00", paymentCount: 3, note: null, closedAt: "", flagged: false, staleSinceClose: false, reconciledAt: null, reconciledByName: null } });
    expect(summarizeCash([counted, row({ amount: "1000.50", paymentCount: 1 }), row({ amount: "0.00", paymentCount: 0 })])).toEqual({ amount: 8500.5, payments: 4, uncounted: 1 });
  });

  it("is empty for a day with no cash", () => {
    expect(summarizeCash([])).toEqual({ amount: 0, payments: 0, uncounted: 0 });
  });
});
