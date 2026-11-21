import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CashTally } from "./CashTally";
import type { CashRow } from "@/lib/types";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: { post: vi.fn(), patch: vi.fn() } }));

const row = (over: Partial<CashRow> = {}): CashRow => ({
  day: "2026-11-20", collectorId: "clerk", collectorName: "Nimal", instituteId: null, instituteName: null, amount: "7500.00", paymentCount: 3, tally: null, ...over,
});
const base = {
  rows: [row(), row({ day: "2026-11-19", collectorName: "Amara", collectorId: "c2", amount: "1000.00", paymentCount: 1 })],
  from: "2026-11-14", to: "2026-11-20", tallyEnabled: true, viewerId: "clerk", isOwner: false,
  institutes: [{ id: "i1", name: "Kandy" }, { id: "i2", name: "Galle" }], review: false,
};
const setup = (over: Partial<Parameters<typeof CashTally>[0]> = {}) => render(<CashTally {...base} {...over} />);

beforeEach(() => vi.clearAllMocks());

describe("the table", () => {
  it("lists every day with the collector and the cash", () => {
    setup();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Amara")).toBeInTheDocument();
    expect(screen.getByText("Rs 7,500")).toBeInTheDocument();
  });

  it("totals the cash shown and says how many days need a count", () => {
    setup();
    expect(screen.getByText(/Rs 8,500 from 4 payments/)).toBeInTheDocument();
    expect(screen.getByText("2 days need a count")).toBeInTheDocument();
  });

  it("says so when there is no cash in the range", () => {
    setup({ rows: [] });
    expect(screen.getByText("No cash collected in this range.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains the owner's switch and shows no count controls when it is off", () => {
    setup({ tallyEnabled: false });
    expect(screen.getByText(/end-of-day cash count is turned off/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Counted cash for 2026-11-20")).not.toBeInTheDocument();
    expect(screen.queryByText(/not counted yet/)).not.toBeInTheDocument();
  });
});

describe("the filters", () => {
  it("moves to the chosen range, keeping the branch", () => {
    setup({ instituteId: "i1" });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    expect(push).toHaveBeenLastCalledWith("/payments/cash?from=2026-11-01&to=2026-11-20&instituteId=i1");
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-10" } });
    expect(push).toHaveBeenLastCalledWith("/payments/cash?from=2026-11-14&to=2026-11-10&instituteId=i1");
  });

  it("filters by branch, and clears it again", async () => {
    const user = userEvent.setup();
    setup();
    await user.selectOptions(screen.getByLabelText("Branch"), "i2");
    expect(push).toHaveBeenLastCalledWith("/payments/cash?from=2026-11-14&to=2026-11-20&instituteId=i2");
    await user.selectOptions(screen.getByLabelText("Branch"), "");
    expect(push).toHaveBeenLastCalledWith("/payments/cash?from=2026-11-14&to=2026-11-20");
  });

  it("offers the owner a needs-review view, and leaves it out for front desk", async () => {
    const user = userEvent.setup();
    const { unmount } = setup({ isOwner: true });
    await user.click(screen.getByLabelText("Counted days not reconciled yet"));
    expect(push).toHaveBeenLastCalledWith("/payments/cash?from=2026-11-14&to=2026-11-20&review=1");
    unmount();
    setup();
    expect(screen.queryByLabelText("Counted days not reconciled yet")).not.toBeInTheDocument();
  });

  it("shows the review box ticked when the review view is on, and turns it off with one click", async () => {
    const user = userEvent.setup();
    setup({ isOwner: true, review: true });
    expect(screen.getByLabelText("Counted days not reconciled yet")).toBeChecked();
    await user.click(screen.getByLabelText("Counted days not reconciled yet"));
    expect(push).toHaveBeenLastCalledWith("/payments/cash?from=2026-11-14&to=2026-11-20");
  });

  it("says there is nothing to review rather than nothing collected", () => {
    setup({ rows: [], isOwner: true, review: true });
    expect(screen.getByText("No counted days are waiting for review.")).toBeInTheDocument();
  });
});
