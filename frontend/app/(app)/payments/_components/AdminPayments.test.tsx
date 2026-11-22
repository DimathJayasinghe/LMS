import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPayments } from "./AdminPayments";
import type { Payment, PaymentStatus, PaymentSummary } from "@/lib/types";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const { upload, patch } = vi.hoisted(() => ({ upload: vi.fn(), patch: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { upload, get: vi.fn(), post: vi.fn(), patch, del: vi.fn() } };
});

const MONTH = "2026-07";
const STATUSES: PaymentStatus[] = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"];

const summary: PaymentSummary = {
  month: MONTH,
  collectedTotal: "5000.00",
  paidCount: 2,
  pendingCount: 1,
  failedCount: 0,
  refundedCount: 0,
};

const payment = (id: string, name: string, status: PaymentStatus): Payment => ({
  id,
  amount: "2500",
  refundedAmount: "0",
  status,
  method: "ONLINE",
  paymentMonth: MONTH,
  createdAt: "",
  updatedAt: "",
  enrollment: {
    id: `e-${id}`,
    classType: "ONLINE",
    userId: `u-${id}`,
    user: { id: `u-${id}`, name, email: "x@y.lk", indexNumber: 42 },
    course: { id: "c1", name: "Physics", year: 2026, monthlyFee: "2500" },
  },
});

const baseProps = {
  timezone: "Asia/Colombo",
  payments: [payment("p1", "Nimal", "SUCCESS")],
  total: 1,
  pageSize: 20,
  page: 1,
  month: MONTH,
  status: "all" as PaymentStatus | "all",
  statuses: STATUSES,
  summary,
  canOverride: false,
};

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  upload.mockReset();
  patch.mockReset();
});

describe("AdminPayments — super-admin override", () => {
  it("does not expose financial overrides to front-desk admins", () => {
    render(<AdminPayments {...baseProps} />);
    expect(screen.queryByRole("button", { name: "Override Nimal's payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refund or view ledger for Nimal" })).not.toBeInTheDocument();
  });

  it("submits reviewed values with an idempotency key and refreshes the records", async () => {
    patch.mockResolvedValue({ data: payment("p1", "Nimal", "FAILED") });
    const user = userEvent.setup();
    render(<AdminPayments {...baseProps} canOverride />);

    await user.click(screen.getByRole("button", { name: "Override Nimal's payment" }));
    await user.selectOptions(screen.getByLabelText("Override status"), "FAILED");
    await user.clear(screen.getByLabelText("Override amount"));
    await user.type(screen.getByLabelText("Override amount"), "1800");
    await user.type(screen.getByLabelText("Override note"), "Approved correction");
    await user.click(screen.getByRole("button", { name: "Apply override" }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith(
      "/payments/p1/override",
      { status: "FAILED", amount: 1800, note: "Approved correction" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    ));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText("Payment override saved.")).toBeInTheDocument();
  });

  it("rejects a non-positive amount before calling the API", async () => {
    const user = userEvent.setup();
    render(<AdminPayments {...baseProps} canOverride />);

    await user.click(screen.getByRole("button", { name: "Override Nimal's payment" }));
    await user.clear(screen.getByLabelText("Override amount"));
    await user.type(screen.getByLabelText("Override amount"), "0");
    await user.click(screen.getByRole("button", { name: "Apply override" }));

    expect(await screen.findByText("Amount must be greater than zero.")).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("AdminPayments — summary + table", () => {
  it("renders the month summary (formatted total + counts) and a record row", () => {
    render(<AdminPayments {...baseProps} />);
    expect(screen.getByText("Rs 5,000")).toBeInTheDocument();
    expect(screen.getByText("Nimal")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("shows the empty state when there are no payments", () => {
    render(<AdminPayments {...baseProps} payments={[]} total={0} />);
    expect(screen.getByText("No payments for these filters.")).toBeInTheDocument();
  });
});

describe("AdminPayments — who owes", () => {
  it("links to the who-owes list for the month on screen", () => {
    render(<AdminPayments {...baseProps} />);
    expect(screen.getByRole("link", { name: "Who owes" })).toHaveAttribute("href", `/payments/owing?month=${MONTH}`);
  });
});

describe("AdminPayments — cash", () => {
  it("links to the cash page", () => {
    render(<AdminPayments {...baseProps} />);
    expect(screen.getByRole("link", { name: "Cash" })).toHaveAttribute("href", "/payments/cash");
  });

  it("shows the user's cash today above the collect form when it is available", () => {
    render(<AdminPayments {...baseProps} todaysCash={{ amount: 7500, payments: 3, needCount: 1 }} />);
    expect(screen.getByText("Your cash today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Count the day" })).toBeInTheDocument();
  });

  it("leaves the strip out when the count is off or unavailable", () => {
    render(<AdminPayments {...baseProps} todaysCash={null} />);
    expect(screen.queryByText("Your cash today")).not.toBeInTheDocument();
    expect(screen.queryByText("No cash taken yet today.")).not.toBeInTheDocument();
  });

  it("offers the branch choice to the collect form only when there are branches", () => {
    const { unmount } = render(<AdminPayments {...baseProps} institutes={[{ id: "i1", name: "Kandy" }]} />);
    expect(screen.getByLabelText("Collecting at")).toBeInTheDocument();
    unmount();
    render(<AdminPayments {...baseProps} />);
    expect(screen.queryByLabelText("Collecting at")).not.toBeInTheDocument();
  });
});

describe("AdminPayments — filters", () => {
  it("pushes month + status on status change", async () => {
    const user = userEvent.setup();
    render(<AdminPayments {...baseProps} />);
    await user.selectOptions(screen.getByLabelText("Filter by status"), "SUCCESS");
    expect(push).toHaveBeenCalledWith("/payments?month=2026-07&status=SUCCESS");
  });

  it("pushes the new month on month change", () => {
    render(<AdminPayments {...baseProps} />);
    fireEvent.change(screen.getByLabelText("Filter by month"), { target: { value: "2026-06" } });
    expect(push).toHaveBeenCalledWith("/payments?month=2026-06");
  });
});

describe("AdminPayments — bulk upload", () => {
  it("shows the bulk upload tool to the owner only", () => {
    const { rerender } = render(<AdminPayments {...baseProps} canBulkUpload />);
    expect(screen.getByLabelText("Bulk payment file")).toBeInTheDocument();

    rerender(<AdminPayments {...baseProps} />);
    expect(screen.queryByLabelText("Bulk payment file")).not.toBeInTheDocument();
    expect(screen.queryByText("Bulk upload")).not.toBeInTheDocument();
  });
});
