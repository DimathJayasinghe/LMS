import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectPayment } from "./CollectPayment";
import { formatCurrency } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import type { Enrollment, Payment, ResolvedBarcodeStudent, User } from "@/lib/types";

const { get, post, push, refresh } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get, post, patch: vi.fn(), upload: vi.fn(), del: vi.fn() } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/components/custom/QrCamera", () => ({
  QrCamera: ({ onDecode }: { onDecode: (text: string) => void }) => {
    useEffect(() => onDecode("NUG-001"), [onDecode]);
    return null;
  },
}));

const student: User = {
  id: "u1",
  name: "Nimal Perera",
  email: "n@x.lk",
  role: "STUDENT",
  indexNumber: 42,
  createdAt: "",
};

const enrollment: Enrollment = {
  id: "e1",
  classType: "PHYSICAL",
  isActive: true,
  userId: "u1",
  courseId: "c1",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "",
  course: {
    id: "c1",
    name: "Physics",
    year: 2026,
    monthlyFee: "2500.00",
    isActive: true,
    subjectId: "s1",
    teacherId: "t1",
  },
};

const chemistry = { id: "c2", name: "Chemistry", year: 2026, monthlyFee: "3000.00", isActive: true };

const paymentFixture = (overrides: Partial<Payment> = {}): Payment => ({
  id: "p1",
  amount: "2500.00",
  refundedAmount: "0.00",
  status: "SUCCESS",
  method: "ENTRANCE",
  paymentMonth: "2026-07",
  createdAt: "",
  updatedAt: "",
  enrollment: {
    id: "e1",
    classType: "PHYSICAL",
    userId: "u1",
    user: { id: "u1", name: "Nimal Perera", email: "n@x.lk", indexNumber: 42 },
    course: { id: "c1", name: "Physics", year: 2026, monthlyFee: "2500.00" },
  },
  ...overrides,
});

function mockGet(paymentsHistory: Payment[] = []) {
  get.mockReset().mockImplementation((path: string) => {
    if (path.startsWith("/users/lookup")) return Promise.resolve({ data: [student], count: 1 });
    if (path.startsWith("/enrollments?userId=")) return Promise.resolve({ data: [enrollment], count: 1 });
    if (path.startsWith("/payments?enrollmentId=")) return Promise.resolve({ data: paymentsHistory, count: paymentsHistory.length });
    if (path.startsWith("/users/resolve-barcode")) {
      const resolved: ResolvedBarcodeStudent = {
        user: { id: "u1", name: "Nimal Perera", indexNumber: 42 },
        instituteId: "inst-1",
        matchedBarcode: "NUG-001",
      };
      return Promise.resolve({ data: resolved });
    }
    if (path === "/classes") return Promise.resolve({ data: [chemistry], count: 1 });
    return Promise.resolve({ data: [], count: 0 });
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-07-14T00:00:00.000Z"));
  mockGet();
  post.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function selectStudentByName(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Search student"), "Nimal");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  const selectBtn = await screen.findByRole("button", { name: "Select" });
  await user.click(selectBtn);
}

describe("CollectPayment — search → select → collect", () => {
  it("cancels a pending search when the query becomes too short", async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    const input = screen.getByLabelText("Search student");
    await user.type(input, "Ni");
    await user.clear(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(get).not.toHaveBeenCalled();
  });

  it("collects the current outstanding month with the pre-filled amount", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    const amountInput = await screen.findByLabelText<HTMLInputElement>("Amount");
    expect(amountInput.value).toBe("2500.00");

    await user.click(screen.getByRole("button", { name: /Collect/ }));

    expect(post).toHaveBeenCalledWith(
      "/payments/collect-entrance",
      { enrollmentId: "e1", paymentMonth: "2026-07", amount: 2500 },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(await screen.findByText("Payment collected — view receipt")).toBeInTheDocument();
  });

  it("lets staff edit the pre-filled amount before submitting", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture({ amount: "1000.00" }) });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    const amountInput = await screen.findByLabelText("Amount");
    await user.clear(amountInput);
    await user.type(amountInput, "1000");
    await user.click(screen.getByRole("button", { name: /Collect/ }));

    expect(post).toHaveBeenCalledWith(
      "/payments/collect-entrance",
      expect.objectContaining({ amount: 1000 }),
      expect.anything(),
    );
  });
});

describe("CollectPayment — barcode scan resolution", () => {
  it("captures institute + barcode from a scan and includes them in the submit body", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await user.click(screen.getByLabelText("Turn camera on"));
    await screen.findByText("Nimal Perera");

    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    await user.click(screen.getByRole("button", { name: /Collect/ }));

    expect(post).toHaveBeenCalledWith(
      "/payments/collect-entrance",
      {
        enrollmentId: "e1",
        paymentMonth: "2026-07",
        amount: 2500,
        collectedAtInstituteId: "inst-1",
        collectedViaBarcode: "NUG-001",
      },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });
});

describe("CollectPayment — the branch the desk collects at", () => {
  const institutes = [{ id: "inst-1", name: "Kandy" }, { id: "inst-2", name: "Galle" }];
  const collectWith = async (user: ReturnType<typeof userEvent.setup>) => {
    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    await user.click(screen.getByRole("button", { name: /Collect/ }));
  };
  beforeEach(() => localStorage.clear());

  it("records the cash against the chosen branch", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" institutes={institutes} />);
    await user.selectOptions(screen.getByLabelText("Collecting at"), "inst-2");
    await collectWith(user);
    expect(post).toHaveBeenCalledWith("/payments/collect-entrance", expect.objectContaining({ collectedAtInstituteId: "inst-2" }), expect.anything());
  });

  it("prefers the chosen branch to the student's home branch from a scan", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" institutes={institutes} />);
    await user.selectOptions(screen.getByLabelText("Collecting at"), "inst-2");
    await user.click(screen.getByLabelText("Turn camera on"));
    await screen.findByText("Nimal Perera");
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    await user.click(screen.getByRole("button", { name: /Collect/ }));
    expect(post).toHaveBeenCalledWith("/payments/collect-entrance", expect.objectContaining({ collectedAtInstituteId: "inst-2", collectedViaBarcode: "NUG-001" }), expect.anything());
  });

  it("sends no branch when none is chosen and the student was found by search", async () => {
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" institutes={institutes} />);
    await collectWith(user);
    expect(post.mock.calls[0]![1]).not.toHaveProperty("collectedAtInstituteId");
  });

  it("starts from the branch chosen on this device earlier", async () => {
    localStorage.setItem("lms.collectionBranch", "inst-1");
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" institutes={institutes} />);
    expect(await screen.findByLabelText("Collecting at")).toHaveValue("inst-1");
    await collectWith(user);
    expect(post).toHaveBeenCalledWith("/payments/collect-entrance", expect.objectContaining({ collectedAtInstituteId: "inst-1" }), expect.anything());
  });

  it("shows the server's reason when the month was paid by someone else meanwhile", async () => {
    post.mockRejectedValueOnce(new ApiError(409, "This month is already paid. Refresh to see the current record.", "ALREADY_PAID"));
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" institutes={institutes} />);
    await collectWith(user);
    expect(await screen.findByText("This month is already paid. Refresh to see the current record.")).toBeInTheDocument();
  });
});

describe("CollectPayment — already-paid months are excluded", () => {
  it("does not offer a month that already has a SUCCESS payment", async () => {
    mockGet([paymentFixture({ paymentMonth: "2026-07", method: "ONLINE", payhereId: "pay_1" })]);
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");

    await screen.findByLabelText("Select month to collect");
    expect(screen.queryByRole("option", { name: /2026-07/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /2026-06/ })).toBeInTheDocument();
  });
});

describe("CollectPayment — receipt link survives an exhausted outstanding list", () => {
  it("still shows the view-receipt link when the collected month was the only one outstanding", async () => {
    // This enrollment's only outstanding month is the current one — after a
    // successful collection the post-submit history refetch reports it as
    // paid, so `outstandingMonths` becomes empty and the component falls
    // into its "Nothing outstanding" branch. The receipt link must not be
    // nested inside that branch, or it disappears exactly when it matters.
    const singleMonthEnrollment = { ...enrollment, createdAt: "2026-07-01T00:00:00.000Z" };
    get.mockReset().mockImplementation((path: string) => {
      if (path.startsWith("/users/lookup")) return Promise.resolve({ data: [student], count: 1 });
      if (path.startsWith("/enrollments?userId=")) return Promise.resolve({ data: [singleMonthEnrollment], count: 1 });
      if (path.startsWith("/payments?enrollmentId=")) {
        return Promise.resolve({ data: [], count: 0 });
      }
      return Promise.resolve({ data: [], count: 0 });
    });
    post.mockResolvedValueOnce({ data: paymentFixture() });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    await screen.findByLabelText("Select month to collect");

    get.mockImplementation((path: string) => {
      if (path.startsWith("/payments?enrollmentId=")) {
        return Promise.resolve({ data: [paymentFixture({ status: "SUCCESS" })], count: 1 });
      }
      return Promise.resolve({ data: [], count: 0 });
    });

    await user.click(screen.getByRole("button", { name: /Collect/ }));

    expect(await screen.findByText("Nothing outstanding for this enrollment.")).toBeInTheDocument();
    expect(screen.getByText("Payment collected — view receipt")).toBeInTheDocument();
  });
});

describe("CollectPayment — session summary", () => {
  it("accumulates each successful collection into the session list with a running total", async () => {
    post
      .mockResolvedValueOnce({ data: paymentFixture({ id: "p1" }) })
      .mockResolvedValueOnce({ data: paymentFixture({ id: "p2", paymentMonth: "2026-06" }) });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await selectStudentByName(user);
    await user.selectOptions(await screen.findByLabelText("Select enrollment"), "e1");
    await user.click(screen.getByRole("button", { name: /Collect/ }));
    await screen.findByText("Payment collected — view receipt");

    await user.selectOptions(screen.getByLabelText("Select month to collect"), "2026-06");
    await user.click(screen.getByRole("button", { name: /Collect/ }));

    await screen.findByText("Collected this session");
    const list = screen.getByText("Collected this session").closest("div")!.parentElement!;
    expect(within(list).getAllByText(/Nimal Perera/)).toHaveLength(2);
    expect(within(list).getByText(formatCurrency(5000))).toBeInTheDocument();
  });
});

describe("CollectPayment — lookup and desk enrolment", () => {
  it("searches students through the lookup route", async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await selectStudentByName(user);

    expect(get).toHaveBeenCalledWith("/users/lookup?q=Nimal");
  });

  it("enrols the chosen student in a class and goes straight to collecting its first fee", async () => {
    const enrolled: Enrollment = {
      ...enrollment,
      id: "e2",
      courseId: "c2",
      createdAt: "2026-07-13T00:00:00.000Z",
      course: { ...enrollment.course, id: "c2", name: "Chemistry", monthlyFee: "3000.00" },
    };
    post.mockResolvedValueOnce({ data: enrolled });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await selectStudentByName(user);
    await user.click(await screen.findByRole("button", { name: /enrol in a class/i }));
    await screen.findByRole("option", { name: /Chemistry/ });
    await user.selectOptions(screen.getByLabelText("Class"), "c2");
    await user.click(screen.getByRole("button", { name: /enrol student/i }));

    expect(post).toHaveBeenCalledWith("/enrollments", { userId: "u1", courseId: "c2", classType: "PHYSICAL" });
    expect(await screen.findByLabelText<HTMLInputElement>("Amount")).toHaveValue(3000);
    expect(screen.getByLabelText<HTMLSelectElement>("Select enrollment")).toHaveValue("e2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the reason when the enrolment is refused", async () => {
    post.mockRejectedValueOnce(new ApiError(409, "Already enrolled in this class in the other mode. Cancel that enrollment first.", "ALREADY_ENROLLED_OTHER_MODE"));
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<CollectPayment timezone="Asia/Colombo" />);

    await selectStudentByName(user);
    await user.click(await screen.findByRole("button", { name: /enrol in a class/i }));
    await screen.findByRole("option", { name: /Chemistry/ });
    await user.selectOptions(screen.getByLabelText("Class"), "c2");
    await user.click(screen.getByRole("button", { name: /enrol student/i }));

    expect(await screen.findByText("Already enrolled in this class in the other mode. Cancel that enrollment first.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLSelectElement>("Select enrollment")).toHaveValue("");
  });
});
