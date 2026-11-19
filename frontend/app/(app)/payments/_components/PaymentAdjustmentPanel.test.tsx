import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentAdjustmentPanel } from "./PaymentAdjustmentPanel";
import type { Payment } from "@/lib/types";

const { get, post, refresh } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get, post } };
});

const payment: Payment = {
  id: "payment-1",
  amount: "2500.00",
  refundedAmount: "500.00",
  status: "SUCCESS",
  method: "ONLINE",
  paymentMonth: "2026-08",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  enrollment: {
    id: "enrollment-1",
    classType: "ONLINE",
    userId: "student-1",
    user: { id: "student-1", name: "Nimal", email: "nimal@example.com", indexNumber: 42 },
    course: { id: "course-1", name: "Physics", year: 2026, monthlyFee: "2500.00" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: [], count: 0 });
});

describe("PaymentAdjustmentPanel", () => {
  it("records an externally completed refund with proof and an idempotency key", async () => {
    post.mockResolvedValue({
      data: {
        payment: { id: payment.id, amount: payment.amount, refundedAmount: "1000.00", status: "SUCCESS" },
        remainingRefundable: "1500.00",
        adjustment: {
          id: "adjustment-1",
          type: "REFUND",
          amount: "500.00",
          statusBefore: "SUCCESS",
          statusAfter: "SUCCESS",
          paymentAmountBefore: "2500.00",
          paymentAmountAfter: "2500.00",
          reason: "Duplicate collection",
          externalReference: "PAYHERE-REF-1",
          createdAt: "2026-08-19T00:00:00.000Z",
          createdBy: { id: "owner-1", name: "Owner" },
        },
      },
    });
    const user = userEvent.setup();
    render(<PaymentAdjustmentPanel payment={payment} onClose={vi.fn()} />);

    expect(await screen.findByText("No adjustments recorded.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Refund amount"), "500");
    await user.type(screen.getByLabelText("Refund reason"), "Duplicate collection");
    await user.type(screen.getByLabelText("Refund external reference"), "PAYHERE-REF-1");
    await user.click(screen.getByRole("button", { name: "Record completed refund" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/payments/payment-1/refunds",
      { amount: 500, reason: "Duplicate collection", externalReference: "PAYHERE-REF-1" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    ));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText("Completed refund recorded.")).toBeInTheDocument();
  });

  it("rejects an amount above the remaining refundable balance client-side", async () => {
    const user = userEvent.setup();
    render(<PaymentAdjustmentPanel payment={payment} onClose={vi.fn()} />);
    await screen.findByText("No adjustments recorded.");
    await user.type(screen.getByLabelText("Refund amount"), "2001");
    await user.type(screen.getByLabelText("Refund reason"), "Duplicate collection");
    await user.type(screen.getByLabelText("Refund external reference"), "PAYHERE-REF-1");
    await user.click(screen.getByRole("button", { name: "Record completed refund" }));

    expect(await screen.findByText("Refund cannot exceed Rs 2,000.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("does not offer another refund after a payment is fully refunded", async () => {
    render(<PaymentAdjustmentPanel payment={{ ...payment, status: "REFUNDED", refundedAmount: "2500.00" }} onClose={vi.fn()} />);
    await screen.findByText("No adjustments recorded.");
    expect(screen.queryByRole("button", { name: "Record completed refund" })).not.toBeInTheDocument();
  });
});
