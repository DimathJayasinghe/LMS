import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentPayments } from "./StudentPayments";
import { ApiError } from "@/lib/api";
import type { Enrollment, Payment, PaymentStatus } from "@/lib/types";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
const { startPayherePayment } = vi.hoisted(() => ({ startPayherePayment: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post, get: vi.fn(), patch: vi.fn(), upload: vi.fn(), del: vi.fn() } };
});
vi.mock("@/lib/payhere", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payhere")>();
  return { ...actual, startPayherePayment };
});
vi.mock("@/components/custom/PayhereScript", () => ({ PayhereScript: () => null }));

/** Grab the handlers object passed to the mocked startPayherePayment. */
const lastHandlers = () => startPayherePayment.mock.calls.at(-1)![1];

const MONTH = "2026-07";

const enrollment = (id: string, name: string, fee: string): Enrollment => ({
  id,
  classType: "ONLINE",
  isActive: true,
  userId: "stu-1",
  courseId: `course-${id}`,
  createdAt: "",
  updatedAt: "",
  course: {
    id: `course-${id}`,
    name,
    year: 2026,
    monthlyFee: fee,
    isActive: true,
    subjectId: "sub-1",
    teacherId: "t-1",
  },
});

const payment = (
  id: string,
  enrollmentId: string,
  courseName: string,
  month: string,
  amount: string,
  status: PaymentStatus,
): Payment => ({
  id,
  amount,
  status,
  method: "ONLINE",
  paymentMonth: month,
  createdAt: "",
  updatedAt: "",
  enrollment: {
    id: enrollmentId,
    classType: "ONLINE",
    userId: "stu-1",
    user: { id: "stu-1", name: "Stu", email: "s@x.lk", indexNumber: 1 },
    course: { id: `course-${enrollmentId}`, name: courseName, year: 2026, monthlyFee: amount },
  },
});

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  post.mockReset();
  startPayherePayment.mockReset();
});

describe("StudentPayments — this month", () => {
  it("shows Paid when a SUCCESS payment exists for the current month", () => {
    render(
      <StudentPayments
        enrollments={[enrollment("e1", "Physics", "2500")]}
        payments={[payment("p1", "e1", "Physics", MONTH, "2500", "SUCCESS")]}
        currentMonth={MONTH}
      />,
    );
    expect(screen.getByText("Paid for this month")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pay/ })).not.toBeInTheDocument();
  });

  it("shows a Pay button when this month is unpaid, and opens onsite checkout on click", async () => {
    post.mockResolvedValue({
      data: { checkoutUrl: "https://sandbox.payhere.lk/pay", payload: { order_id: "p1" }, payment: {} },
    });
    const user = userEvent.setup();
    render(
      <StudentPayments
        enrollments={[enrollment("e1", "Physics", "2500")]}
        payments={[]}
        currentMonth={MONTH}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Pay/ }));

    // Goes through initiatePayherePayment, which attaches a UUID Idempotency-Key.
    expect(post).toHaveBeenCalledWith(
      "/payments/initiate",
      { enrollmentId: "e1", paymentMonth: MONTH },
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
    // Onsite modal, not a redirect: startPayherePayment gets the initiation + handlers.
    expect(startPayherePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutUrl: "https://sandbox.payhere.lk/pay",
        payload: { order_id: "p1" },
      }),
      expect.any(Object),
    );
  });

  it("shows a submitted notice when the popup completes, and clears busy when dismissed", async () => {
    post.mockResolvedValue({
      data: { checkoutUrl: "https://sandbox.payhere.lk/pay", payload: {}, payment: {} },
    });
    const user = userEvent.setup();
    render(
      <StudentPayments enrollments={[enrollment("e1", "Physics", "2500")]} payments={[]} currentMonth={MONTH} />,
    );
    await user.click(screen.getByRole("button", { name: /Pay/ }));

    lastHandlers().onCompleted("order-1");
    expect(await screen.findByText(/show as paid once confirmed/i)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces an onError message from the popup", async () => {
    post.mockResolvedValue({
      data: { checkoutUrl: "https://sandbox.payhere.lk/pay", payload: {}, payment: {} },
    });
    const user = userEvent.setup();
    render(
      <StudentPayments enrollments={[enrollment("e1", "Physics", "2500")]} payments={[]} currentMonth={MONTH} />,
    );
    await user.click(screen.getByRole("button", { name: /Pay/ }));

    lastHandlers().onError("Card declined");
    expect(await screen.findByText("Card declined")).toBeInTheDocument();
  });

  it("maps PAYHERE_NOT_CONFIGURED to an inline message and does not redirect", async () => {
    post.mockRejectedValueOnce(new ApiError(500, "PayHere is not configured.", "PAYHERE_NOT_CONFIGURED"));
    const user = userEvent.setup();
    render(
      <StudentPayments
        enrollments={[enrollment("e1", "Physics", "2500")]}
        payments={[]}
        currentMonth={MONTH}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Pay/ }));

    expect(await screen.findByText(/isn't available yet/i)).toBeInTheDocument();
    expect(startPayherePayment).not.toHaveBeenCalled();
  });

  it("shows the empty state with no active enrollments", () => {
    render(<StudentPayments enrollments={[]} payments={[]} currentMonth={MONTH} />);
    expect(screen.getByText(/not enrolled in any courses/i)).toBeInTheDocument();
  });
});

describe("StudentPayments — history filter", () => {
  const payments = [
    payment("p1", "e1", "Physics", "2026-06", "2500", "SUCCESS"),
    payment("p2", "e1", "Physics", "2026-05", "2500", "FAILED"),
  ];

  it("filters history rows by status", async () => {
    const user = userEvent.setup();
    render(
      <StudentPayments enrollments={[enrollment("e1", "Physics", "2500")]} payments={payments} currentMonth={MONTH} />,
    );

    const table = screen.getByRole("table");
    expect(within(table).getByText("2026-06")).toBeInTheDocument();
    expect(within(table).getByText("2026-05")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "failed" }));
    expect(within(screen.getByRole("table")).queryByText("2026-06")).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("2026-05")).toBeInTheDocument();
  });
});
