import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { CashPanel } from "./CashPanel";
import type { CashRow, ConsoleCash } from "@/lib/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-server", () => ({ api: { get } }));
vi.mock("@/lib/session", () => ({ guard401: <T,>(p: Promise<T>) => p }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined, redirect: vi.fn() }));

const tally = (over: Partial<NonNullable<CashRow["tally"]>> = {}) => ({
  id: "t1", countedAmount: "4500.00", systemAmount: "4500.00", variance: "0.00", paymentCount: 3, note: null, closedAt: "2026-11-20T10:00:00Z",
  flagged: false, staleSinceClose: false, reconciledAt: null, reconciledByName: null, ...over,
});
const row = (over: Partial<CashRow> = {}): CashRow => ({
  day: "2026-11-20", collectorId: "c1", collectorName: "Desk One", instituteId: "i1", instituteName: "Nugegoda", amount: "4500.00", paymentCount: 3, tally: null, ...over,
});
const panel = (over: Partial<ConsoleCash> = {}): ConsoleCash => ({
  date: "2026-11-20", tallyEnabled: true, collectedTotal: "0.00", paymentCount: 0, rows: [], flagged: [], unreconciled: { count: 0, rows: [], from: "2026-10-21", to: "2026-11-19" },
  month: { month: "2026-11", byMethod: [] }, ...over,
});
const show = async (over: Partial<ConsoleCash> = {}) => {
  get.mockResolvedValue({ status: "success", data: panel(over) });
  render(await CashPanel({ cookie: "cookie" }));
};

beforeEach(() => vi.clearAllMocks());

describe("CashPanel", () => {
  it("reads the console endpoint with the cookie", async () => {
    await show();
    expect(get).toHaveBeenCalledWith("/console/cash", expect.objectContaining({ cookie: "cookie" }));
  });

  it("says so when no cash has been taken, with zeros", async () => {
    await show();
    expect(screen.getByText("No cash has been taken yet today.")).toBeInTheDocument();
    expect(screen.getByText("Collected").nextSibling).toHaveTextContent("Rs 0");
    expect(screen.getByText("Needs attention").nextSibling).toHaveTextContent("0");
    expect(screen.getByText("No fees recorded for this month yet.")).toBeInTheDocument();
  });

  it("shows the totals and one line per collector and branch", async () => {
    await show({
      collectedTotal: "6000.50", paymentCount: 4,
      rows: [row({ tally: tally() }), row({ collectorId: "c2", collectorName: "Desk Two", instituteId: null, instituteName: null, amount: "1500.50", paymentCount: 1 })],
    });
    expect(screen.getByText("Collected").nextSibling).toHaveTextContent("Rs 6,000.50");
    expect(screen.getByText("Payments").nextSibling).toHaveTextContent("4");
    expect(screen.getByText(/Desk One/)).toBeInTheDocument();
    expect(screen.getByText(/No branch/)).toBeInTheDocument();
    expect(screen.getByText("Not counted")).toBeInTheDocument();
  });

  it("flags a differing count and counts it as needing attention", async () => {
    const flagged = row({ collectorName: "Desk Three", tally: tally({ flagged: true, variance: "-500.00" }) });
    await show({ rows: [flagged], flagged: [flagged] });
    const list = screen.getByText("Counts that differ").parentElement!;
    expect(within(list).getByText(/Desk Three/)).toBeInTheDocument();
    expect(within(list).getByText("Short Rs 500")).toBeInTheDocument();
    expect(screen.getByText("Needs attention").nextSibling).toHaveTextContent("1");
  });

  it("counts waiting days once, and does not count an older flagged day twice", async () => {
    const older = row({ day: "2026-11-18", tally: tally({ flagged: true, variance: "250.00" }) });
    await show({ flagged: [older], unreconciled: { count: 3, rows: [older], from: "2026-10-21", to: "2026-11-19" } });
    expect(screen.getByText("Needs attention").nextSibling).toHaveTextContent("3");
    expect(screen.getByText(/3 counted days are waiting/)).toBeInTheDocument();
  });

  it("opens the review queue over the same days it counted, not the cash page's default week", async () => {
    await show({ unreconciled: { count: 1, rows: [row({ day: "2026-11-10" })], from: "2026-10-21", to: "2026-11-19" } });
    expect(screen.getByRole("link", { name: "Review them" })).toHaveAttribute("href", "/payments/cash?review=1&from=2026-10-21&to=2026-11-19");
  });

  it("uses the singular for one waiting day", async () => {
    await show({ unreconciled: { count: 1, rows: [row({ day: "2026-11-18" })], from: "2026-10-21", to: "2026-11-19" } });
    expect(screen.getByText(/1 counted day is waiting/)).toBeInTheDocument();
  });

  it("shows a reconciled count calmly, not as a problem", async () => {
    const reconciled = row({ tally: tally({ flagged: true, variance: "-500.00", reconciledAt: "2026-11-20T11:00:00Z" }) });
    await show({ rows: [reconciled] });
    expect(screen.getByText("Reconciled")).not.toHaveClass("text-destructive");
  });

  it("hides count labels when the owner turned counting off", async () => {
    await show({ tallyEnabled: false, rows: [row()], collectedTotal: "4500.00", paymentCount: 3 });
    expect(screen.queryByText("Not counted")).not.toBeInTheDocument();
  });

  it("names each method for the month", async () => {
    await show({ month: { month: "2026-11", byMethod: [{ method: "ENTRANCE", collected: "90000.00", paidCount: 60 }, { method: "ONLINE", collected: "30000.00", paidCount: 20 }] } });
    expect(screen.getByRole("heading", { name: "Fees for November 2026, by method" })).toBeInTheDocument();
    expect(screen.getByText("At the desk")).toBeInTheDocument();
    expect(screen.getByText("Online (PayHere)")).toBeInTheDocument();
    expect(screen.getByText(/Rs 90,000/)).toBeInTheDocument();
  });

  it("links to the full cash page", async () => {
    await show();
    expect(screen.getByRole("link", { name: "Open cash" })).toHaveAttribute("href", "/payments/cash");
  });

  it("shows its own error and nothing else when the read fails", async () => {
    get.mockRejectedValue(new ApiError(500, "boom"));
    render(await CashPanel({ cookie: "cookie" }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
    expect(screen.getByRole("heading", { name: "Cash today" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open cash" })).not.toBeInTheDocument();
  });
});
