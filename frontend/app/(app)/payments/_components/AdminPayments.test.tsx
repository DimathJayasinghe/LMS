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
  it("uploads a file, renders the result incl. per-row errors, and refreshes", async () => {
    upload.mockResolvedValue({
      data: { total: 2, created: 1, updated: 0, skipped: 0, errors: [{ row: 3, message: "Unknown index." }] },
    });
    const user = userEvent.setup();
    render(<AdminPayments {...baseProps} />);

    const file = new File(["dummy"], "payments.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await user.upload(screen.getByLabelText("Bulk payment file"), file);

    expect(upload).toHaveBeenCalledWith(
      "/payments/bulk-upload",
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
    expect(await screen.findByText(/1 created/)).toBeInTheDocument();
    expect(screen.getByText(/Row 3: Unknown index\./)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });
});
