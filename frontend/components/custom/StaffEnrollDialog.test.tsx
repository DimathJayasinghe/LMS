import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Enrollment } from "@/lib/types";
import { StaffEnrollDialog } from "./StaffEnrollDialog";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { get: mocks.get, post: mocks.post },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
    }
  },
}));
import { ApiError } from "@/lib/api";

const student = { id: "u1", name: "Nimal Perera", indexNumber: 42 };
const fixedCourse = { id: "c1", name: "A/L Physics", monthlyFee: "2500.00" };
const enrollment = { id: "e1", userId: "u1", courseId: "c1", classType: "PHYSICAL", isActive: true, course: { ...fixedCourse, isActive: true } } as unknown as Enrollment;
const classes = [
  { id: "c1", name: "A/L Physics", year: 2027, monthlyFee: "2500.00", isActive: true },
  { id: "c2", name: "O/L Maths", year: 2026, monthlyFee: "1800.00", isActive: true },
  { id: "c3", name: "Closed Chemistry", year: 2025, monthlyFee: "2000.00", isActive: false },
];

function setup(props: Partial<React.ComponentProps<typeof StaffEnrollDialog>> = {}) {
  const onEnrolled = vi.fn();
  const onOpenChange = vi.fn();
  render(<StaffEnrollDialog open student={student} onEnrolled={onEnrolled} onOpenChange={onOpenChange} {...props} />);
  return { onEnrolled, onOpenChange, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: classes, count: classes.length });
  mocks.post.mockResolvedValue({ data: enrollment });
});

describe("StaffEnrollDialog with a fixed class", () => {
  it("names the student, the class and the fee, and does not list classes", () => {
    setup({ course: fixedCourse });
    expect(screen.getByText(/Nimal Perera/)).toBeInTheDocument();
    expect(screen.getByText(/A\/L Physics/)).toBeInTheDocument();
    expect(screen.getByText(/2,500/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/^class$/i)).not.toBeInTheDocument();
  });

  it("starts on Physical because this is the front desk, and enrols in that mode", async () => {
    const { user, onEnrolled, onOpenChange } = setup({ course: fixedCourse });
    expect(screen.getByRole("button", { name: "Physical" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /enrol student/i }));
    expect(mocks.post).toHaveBeenCalledWith("/enrollments", { userId: "u1", courseId: "c1", classType: "PHYSICAL" });
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith(enrollment));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("enrols in Online when that is picked", async () => {
    const { user } = setup({ course: fixedCourse });
    await user.click(screen.getByRole("button", { name: "Online" }));
    expect(screen.getByRole("button", { name: "Online" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /enrol student/i }));
    expect(mocks.post).toHaveBeenCalledWith("/enrollments", { userId: "u1", courseId: "c1", classType: "ONLINE" });
  });

  it("shows the server's reason, stays open and lets the desk try again", async () => {
    mocks.post.mockRejectedValueOnce(new ApiError(409, "Already enrolled in this class in the other mode. Cancel that enrollment first.", "ALREADY_ENROLLED_OTHER_MODE"));
    const { user, onEnrolled, onOpenChange } = setup({ course: fixedCourse });
    await user.click(screen.getByRole("button", { name: /enrol student/i }));
    expect(await screen.findByText("Already enrolled in this class in the other mode. Cancel that enrollment first.")).toBeInTheDocument();
    expect(onEnrolled).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /enrol student/i })).toBeEnabled();
  });

  it("falls back to a general message for an unexpected failure", async () => {
    mocks.post.mockRejectedValueOnce(new Error("network"));
    const { user } = setup({ course: fixedCourse });
    await user.click(screen.getByRole("button", { name: /enrol student/i }));
    expect(await screen.findByText(/couldn.t enrol/i)).toBeInTheDocument();
  });

  it("disables the buttons while the request is running so a double click sends once", async () => {
    let finish: (v: unknown) => void = () => {};
    mocks.post.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { user } = setup({ course: fixedCourse });
    await user.click(screen.getByRole("button", { name: /enrol student/i }));
    expect(screen.getByRole("button", { name: /enrol student/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /enrol student/i }));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await act(async () => finish({ data: enrollment }));
  });
});

describe("StaffEnrollDialog choosing a class", () => {
  it("lists only active classes and needs a choice before it can enrol", async () => {
    const { user } = setup();
    const select = screen.getByLabelText(/^class$/i);
    expect(await screen.findByRole("option", { name: /A\/L Physics/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /O\/L Maths/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Closed Chemistry/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enrol student/i })).toBeDisabled();

    await user.selectOptions(select, "c2");
    expect(screen.getByText(/1,800/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /enrol student/i }));
    expect(mocks.post).toHaveBeenCalledWith("/enrollments", { userId: "u1", courseId: "c2", classType: "PHYSICAL" });
  });

  it("does not load classes while closed", () => {
    render(<StaffEnrollDialog open={false} student={student} onEnrolled={vi.fn()} onOpenChange={vi.fn()} />);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("says so when the classes cannot be loaded", async () => {
    mocks.get.mockRejectedValueOnce(new Error("down"));
    setup();
    expect(await screen.findByText(/couldn.t load the classes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enrol student/i })).toBeDisabled();
  });
});
