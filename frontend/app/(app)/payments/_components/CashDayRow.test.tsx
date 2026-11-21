import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CashDayRow } from "./CashDayRow";
import { ApiError } from "@/lib/api";
import type { CashRow, CashTallyView } from "@/lib/types";

const { post, patch, refresh } = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post, patch } };
});

const tally = (over: Partial<CashTallyView> = {}): CashTallyView => ({
  id: "t1", countedAmount: "7500.00", systemAmount: "7500.00", variance: "0.00", paymentCount: 3, note: null, closedAt: "2026-11-20T10:00:00Z",
  flagged: false, staleSinceClose: false, reconciledAt: null, reconciledByName: null, ...over,
});
const row = (over: Partial<CashRow> = {}): CashRow => ({
  day: "2026-11-20", collectorId: "clerk", collectorName: "Nimal", instituteId: "i1", instituteName: "Kandy", amount: "7500.00", paymentCount: 3, tally: null, ...over,
});
const setup = (r: CashRow, viewerId = "clerk", isOwner = false, counting = true) =>
  render(<table><tbody><CashDayRow row={r} viewerId={viewerId} isOwner={isOwner} counting={counting} /></tbody></table>);

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ status: "success", data: {} });
  patch.mockResolvedValue({ status: "success", data: {} });
});

describe("what the row shows", () => {
  it("shows the day, collector, branch, cash and payment count", () => {
    setup(row());
    expect(screen.getByText("2026-11-20")).toBeInTheDocument();
    expect(screen.getByText("Nimal")).toBeInTheDocument();
    expect(screen.getByText("Kandy")).toBeInTheDocument();
    expect(screen.getByText("Rs 7,500")).toBeInTheDocument();
    expect(screen.getByText("3 payments")).toBeInTheDocument();
  });

  it("says no branch when the cash has none, and 1 payment in the singular", () => {
    setup(row({ instituteId: null, instituteName: null, paymentCount: 1 }));
    expect(screen.getByText("No branch")).toBeInTheDocument();
    expect(screen.getByText("1 payment")).toBeInTheDocument();
  });

  it("shows a matching count quietly", () => {
    setup(row({ tally: tally() }), "someone");
    expect(screen.getByText("Counted Rs 7,500")).toBeInTheDocument();
    expect(screen.getByText("Matches")).toBeInTheDocument();
  });

  it("shows how much is short or over, as an alert when the owner's threshold is passed", () => {
    setup(row({ tally: tally({ countedAmount: "7499.00", variance: "-1.00", flagged: true }) }), "someone");
    expect(screen.getByText("Short Rs 1")).toBeInTheDocument();
    expect(screen.getByText("Needs a look")).toBeInTheDocument();
  });

  it("does not raise a flag for a difference inside the threshold", () => {
    setup(row({ tally: tally({ countedAmount: "7499.00", variance: "-1.00", flagged: false }) }), "someone");
    expect(screen.getByText("Short Rs 1")).toBeInTheDocument();
    expect(screen.queryByText("Needs a look")).not.toBeInTheDocument();
  });

  it("warns when cash changed after the count, and keeps the counted figures visible", () => {
    setup(row({ amount: "10000.00", paymentCount: 4, tally: tally({ staleSinceClose: true }) }), "someone");
    expect(screen.getByText("Cash changed after the count")).toBeInTheDocument();
    expect(screen.getByText("Counted Rs 7,500")).toBeInTheDocument();
  });

  it("shows the note and who reconciled", () => {
    setup(row({ tally: tally({ note: "Rs 1 coin missing", reconciledAt: "2026-11-21T04:00:00Z", reconciledByName: "Owner" }) }), "someone", true);
    expect(screen.getByText("Rs 1 coin missing")).toBeInTheDocument();
    expect(screen.getByText("Reconciled by Owner")).toBeInTheDocument();
  });
});

describe("counting the day", () => {
  it("lets the collector type the count and sends it for this day and branch", async () => {
    const user = userEvent.setup();
    setup(row());
    await user.type(screen.getByLabelText("Counted cash for 2026-11-20"), "7499.5");
    await user.click(screen.getByRole("button", { name: "Count" }));
    expect(post).toHaveBeenCalledWith("/payments/cash-tally", { day: "2026-11-20", instituteId: "i1", countedAmount: 7499.5 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("puts the form away once the count is saved", async () => {
    const user = userEvent.setup();
    setup(row());
    await user.type(screen.getByLabelText("Counted cash for 2026-11-20"), "7500");
    await user.click(screen.getByRole("button", { name: "Count" }));
    expect(screen.queryByLabelText("Counted cash for 2026-11-20")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recount" })).toBeInTheDocument();
  });

  it("sends the no-branch marker and the note when there is one", async () => {
    const user = userEvent.setup();
    setup(row({ instituteId: null, instituteName: null }));
    await user.type(screen.getByLabelText("Counted cash for 2026-11-20"), "0");
    await user.type(screen.getByLabelText("Note for 2026-11-20"), " short ");
    await user.click(screen.getByRole("button", { name: "Count" }));
    expect(post).toHaveBeenCalledWith("/payments/cash-tally", { day: "2026-11-20", instituteId: null, countedAmount: 0, note: "short" });
  });

  it.each([["", "nothing typed"], ["-5", "a negative amount"], ["abc", "text"]])("will not send %j (%s)", async (typed) => {
    const user = userEvent.setup();
    setup(row());
    if (typed) await user.type(screen.getByLabelText("Counted cash for 2026-11-20"), typed);
    expect(screen.getByRole("button", { name: "Count" })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's reason and keeps what was typed", async () => {
    post.mockRejectedValue(new ApiError(409, "The owner already reconciled this day.", "TALLY_RECONCILED"));
    const user = userEvent.setup();
    setup(row());
    await user.type(screen.getByLabelText("Counted cash for 2026-11-20"), "7000");
    await user.click(screen.getByRole("button", { name: "Count" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The owner already reconciled this day.");
    expect(screen.getByLabelText("Counted cash for 2026-11-20")).toHaveValue(7000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not offer a count to someone else's cash, even to the owner", () => {
    setup(row(), "owner", true);
    expect(screen.getByText("Not counted yet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Counted cash for 2026-11-20")).not.toBeInTheDocument();
  });

  it("offers a recount on a counted day, prefilled, and resends", async () => {
    const user = userEvent.setup();
    setup(row({ tally: tally() }));
    expect(screen.queryByLabelText("Counted cash for 2026-11-20")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recount" }));
    expect(screen.getByLabelText("Counted cash for 2026-11-20")).toHaveValue(7500);
    await user.clear(screen.getByLabelText("Counted cash for 2026-11-20"));
    await user.type(screen.getByLabelText("Counted cash for 2026-11-20"), "7400");
    await user.click(screen.getByRole("button", { name: "Count" }));
    expect(post).toHaveBeenCalledWith("/payments/cash-tally", expect.objectContaining({ countedAmount: 7400 }));
  });

  it("offers no recount once the owner reconciled the day", () => {
    setup(row({ tally: tally({ reconciledAt: "2026-11-21T04:00:00Z", reconciledByName: "Owner" }) }));
    expect(screen.queryByRole("button", { name: "Recount" })).not.toBeInTheDocument();
  });
});

describe("when the owner turned the count off", () => {
  it("shows the cash and nothing to act on", () => {
    setup(row({ tally: tally() }), "clerk", true, false);
    expect(screen.getByText("Rs 7,500")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not say a day is waiting for a count", () => {
    setup(row(), "clerk", false, false);
    expect(screen.queryByText("Not counted yet")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Counted cash for 2026-11-20")).not.toBeInTheDocument();
  });
});

describe("reconciling", () => {
  it("lets the owner reconcile a counted day and refreshes", async () => {
    const user = userEvent.setup();
    setup(row({ tally: tally() }), "someone", true);
    await user.click(screen.getByRole("button", { name: "Reconcile" }));
    expect(patch).toHaveBeenCalledWith("/payments/cash-tally/t1/reconcile", {});
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["front desk", row({ tally: tally() }), false],
    ["an uncounted day", row(), true],
    ["a day already reconciled", row({ tally: tally({ reconciledAt: "2026-11-21T04:00:00Z" }) }), true],
  ])("shows no Reconcile button for %s", (_label, r, isOwner) => {
    setup(r, "someone", isOwner);
    expect(screen.queryByRole("button", { name: "Reconcile" })).not.toBeInTheDocument();
  });

  it("shows the server's reason when it fails", async () => {
    patch.mockRejectedValue(new ApiError(404, "Cash count not found.", "CASH_TALLY_NOT_FOUND"));
    const user = userEvent.setup();
    setup(row({ tally: tally() }), "someone", true);
    await user.click(screen.getByRole("button", { name: "Reconcile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cash count not found.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
