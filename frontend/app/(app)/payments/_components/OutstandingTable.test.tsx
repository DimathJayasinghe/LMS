import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutstandingTable } from "./OutstandingTable";
import { ApiError } from "@/lib/api";
import type { OutstandingRow } from "@/lib/types";

const { post, push, refresh } = vi.hoisted(() => ({ post: vi.fn(), push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post } };
});

const row = (over: Partial<OutstandingRow> = {}): OutstandingRow => ({
  enrollmentId: "e1", studentId: "s1", studentName: "Nimal Perera", indexNumber: 1001, phone: "0771234567", courseId: "c1",
  courseName: "Physics", classType: "PHYSICAL", monthsOwed: 2, amount: "1500.00", totalOwed: "3000.00", inGrace: false, graceUntil: "2026-11-10", ...over,
});
const rows = [
  row(),
  row({ enrollmentId: "e2", studentId: "s2", studentName: "Kamal Silva", indexNumber: 1002, phone: null, monthsOwed: 1, totalOwed: "1500.00" }),
  row({ enrollmentId: "e3", studentId: "s3", studentName: "Sunil Fernando", indexNumber: 1003, inGrace: true }),
];
const courses = [{ id: "c1", name: "Physics", year: 2026 }, { id: "c2", name: "Chemistry", year: 2026 }];
const base = { rows, total: 3, page: 1, pageSize: 50, month: "2026-11", courseId: undefined, courses, canExport: false };

const setup = (props: Partial<Parameters<typeof OutstandingTable>[0]> = {}) => {
  const user = userEvent.setup();
  render(<OutstandingTable {...base} {...props} />);
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { sent: 2, skipped: [] } });
});

describe("the list", () => {
  it("shows who owes, with index number, mobile, course and months owed", () => {
    setup();
    const line = screen.getByText("Nimal Perera").closest("tr")!;
    expect(within(line).getByText("#1001")).toBeInTheDocument();
    expect(within(line).getByRole("link", { name: "0771234567" })).toHaveAttribute("href", "tel:0771234567");
    expect(within(line).getByText(/Physics/)).toBeInTheDocument();
    expect(within(line).getByText("2 months")).toBeInTheDocument();
    expect(screen.getByText("Kamal Silva").closest("tr")!).toHaveTextContent("1 month");
  });

  it("shows a dash instead of a missing mobile", () => {
    setup();
    expect(within(screen.getByText("Kamal Silva").closest("tr")!).getByText("No mobile")).toBeInTheDocument();
  });

  it("marks a student in the grace days and keeps them out of reminders", () => {
    setup();
    const line = screen.getByText("Sunil Fernando").closest("tr")!;
    expect(within(line).getByText(/In grace until 10 Nov/)).toBeInTheDocument();
    expect(within(line).getByRole("checkbox")).toBeDisabled();
  });

  it("says so when nobody owes", () => {
    setup({ rows: [], total: 0 });
    expect(screen.getByText("Nobody owes a fee for these filters.")).toBeInTheDocument();
  });

  it("shows the count and the page", () => {
    setup({ total: 120, page: 2 });
    expect(screen.getByText(/120 owing · page 2 of 3/)).toBeInTheDocument();
  });
});

describe("filters", () => {
  it("changing the month reloads the list from page 1 keeping the course", () => {
    setup({ courseId: "c1" });
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-10" } });
    expect(push).toHaveBeenLastCalledWith("/payments/owing?month=2026-10&courseId=c1");
  });

  it("choosing a course reloads the list keeping the month", async () => {
    const user = setup();
    await user.selectOptions(screen.getByLabelText("Course"), "c2");
    expect(push).toHaveBeenLastCalledWith("/payments/owing?month=2026-11&courseId=c2");
  });
});

describe("reminders", () => {
  it("cannot send until someone is ticked", () => {
    setup();
    expect(screen.getByRole("button", { name: /Remind selected/ })).toBeDisabled();
  });

  it("selects everyone who can be reminded and leaves out students in grace", async () => {
    const user = setup();
    await user.click(screen.getByRole("checkbox", { name: "Select everyone who can be reminded" }));
    expect(screen.getByRole("button", { name: "Remind selected (2)" })).toBeEnabled();
  });

  it("asks before sending, and cancelling sends nothing", async () => {
    const user = setup();
    await user.click(screen.getByRole("checkbox", { name: "Select Nimal Perera" }));
    await user.click(screen.getByRole("button", { name: "Remind selected (1)" }));
    expect(screen.getByText(/Send 1 fee reminder for 2026-11\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(post).not.toHaveBeenCalled();
  });

  it("sends the chosen enrollments with a fresh idempotency key, then reports and refreshes", async () => {
    const user = setup();
    await user.click(screen.getByRole("checkbox", { name: "Select Nimal Perera" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Kamal Silva" }));
    await user.click(screen.getByRole("button", { name: "Remind selected (2)" }));
    await user.click(screen.getByRole("button", { name: "Send reminders" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body, options] = post.mock.calls[0]!;
    expect(path).toBe("/payments/outstanding/reminders");
    expect(body).toEqual({ month: "2026-11", enrollmentIds: ["e1", "e2"] });
    expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("2 reminders sent.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("with a course chosen, can remind everyone owing in it without listing ids", async () => {
    const user = setup({ courseId: "c1" });
    await user.click(screen.getByRole("button", { name: "Remind everyone in this course" }));
    await user.click(screen.getByRole("button", { name: "Send reminders" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0]![1]).toEqual({ month: "2026-11", courseId: "c1" });
  });

  it("offers no whole-course reminder until a course is chosen", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Remind everyone in this course" })).not.toBeInTheDocument();
  });

  it("shows the server's reason when it refuses", async () => {
    post.mockRejectedValue(new ApiError(409, "Fee reminders start on day 11 of the month, after the grace days.", "REMINDER_TOO_EARLY"));
    const user = setup();
    await user.click(screen.getByRole("checkbox", { name: "Select Nimal Perera" }));
    await user.click(screen.getByRole("button", { name: "Remind selected (1)" }));
    await user.click(screen.getByRole("button", { name: "Send reminders" }));
    expect(await screen.findByText(/start on day 11/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("explains what was left out", async () => {
    post.mockResolvedValue({ data: { sent: 1, skipped: [{ enrollmentId: "e2", reason: "REMINDER_LIMIT_REACHED" }] } });
    const user = setup();
    await user.click(screen.getByRole("checkbox", { name: "Select everyone who can be reminded" }));
    await user.click(screen.getByRole("button", { name: /Remind selected/ }));
    await user.click(screen.getByRole("button", { name: "Send reminders" }));
    expect(await screen.findByText("1 reminder sent. Left out: 1 already reminded this month.")).toBeInTheDocument();
  });

  it("clears the ticks when the month or course changes (new list)", () => {
    // A different list means different enrollments; ticks from the old one must not carry over.
    const { rerender } = render(<OutstandingTable {...base} />);
    rerender(<OutstandingTable {...base} month="2026-10" rows={[row({ enrollmentId: "e9", studentName: "Other" })]} total={1} />);
    expect(screen.getByRole("button", { name: /Remind selected/ })).toBeDisabled();
  });
});

describe("export", () => {
  it("is only offered to the owner", () => {
    setup({ canExport: false });
    expect(screen.queryByRole("link", { name: /Export CSV/ })).not.toBeInTheDocument();
  });

  it("links to the CSV for the month and course on screen", () => {
    setup({ canExport: true, courseId: "c1" });
    expect(screen.getByRole("link", { name: /Export CSV/ })).toHaveAttribute("href", expect.stringMatching(/\/payments\/outstanding\/export\?month=2026-11&courseId=c1$/));
  });
});
