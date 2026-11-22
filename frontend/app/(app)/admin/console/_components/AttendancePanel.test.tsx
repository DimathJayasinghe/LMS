import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { AttendancePanel } from "./AttendancePanel";
import type { ConsoleAttendance, ConsoleAttendanceSession } from "@/lib/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api-server", () => ({ api: { get } }));
vi.mock("@/lib/session", () => ({ guard401: <T,>(p: Promise<T>) => p }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined, redirect: vi.fn() }));

const session = (over: Partial<ConsoleAttendanceSession> = {}): ConsoleAttendanceSession => ({
  sessionId: "s1", title: "Revision", courseName: "Physics", startsAt: "2026-11-20T03:30:00Z", durationMinutes: 90,
  classType: null, instituteName: "Kandy Branch", scanned: 12, enrolled: 40, ...over,
});
const none = { from: "2026-10-22", to: "2026-11-20", withoutEnrollment: 0, onlineOnly: 0, unpaid: 0 };
const show = async (over: Partial<ConsoleAttendance> = {}) => {
  get.mockResolvedValue({ status: "success", data: { date: "2026-11-20", sessions: [], flagged: none, ...over } });
  render(await AttendancePanel({ cookie: "cookie" }));
};

beforeEach(() => vi.clearAllMocks());

describe("AttendancePanel", () => {
  it("reads the console endpoint with the cookie", async () => {
    await show();
    expect(get).toHaveBeenCalledWith("/console/attendance-today", expect.objectContaining({ cookie: "cookie" }));
  });

  it("says no class is scheduled, and still shows the warnings", async () => {
    await show({ flagged: { ...none, unpaid: 3 } });
    expect(screen.getByText("No class is scheduled for today.")).toBeInTheDocument();
    expect(screen.getByText("Classes today").nextSibling).toHaveTextContent("0");
    expect(screen.getByText("3 scans without a paid month")).toBeInTheDocument();
  });

  it("lists each class with its time, branch and how many scanned of those enrolled", async () => {
    await show({ sessions: [session(), session({ sessionId: "s2", title: "Lab", scanned: 0, enrolled: 5, instituteName: null, classType: "ONLINE" })] });
    expect(screen.getByText("Classes today").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("Scanned in").nextSibling).toHaveTextContent("12");
    expect(screen.getByText(/Revision/)).toHaveTextContent("9:00");
    expect(screen.getByText(/Revision/)).toHaveTextContent("Kandy Branch");
    expect(screen.getByText(/Lab/)).toHaveTextContent("online");
    expect(screen.getByText(/Lab/)).not.toHaveTextContent("Kandy Branch");
    expect(screen.getByText("of 40 scanned")).toBeInTheDocument();
  });

  it("names the day the warning counts start from", async () => {
    await show();
    expect(screen.getByRole("heading", { name: "Scans that broke a rule since 2026-10-22" })).toBeInTheDocument();
  });

  it("shows a calm None when no scan broke a rule, and flags the ones that did", async () => {
    await show({ flagged: { ...none, withoutEnrollment: 1, onlineOnly: 2 } });
    expect(screen.getByText("1 scan without an enrollment")).toBeInTheDocument();
    expect(screen.getByText("2 scans enrolled online only")).toBeInTheDocument();
    expect(screen.getByText("1 scan without an enrollment")).toHaveClass("text-destructive");
    expect(screen.getByText("2 scans enrolled online only")).toHaveClass("text-destructive");
    expect(screen.getByText("0 scans without a paid month")).not.toHaveClass("text-destructive");
    expect(screen.getAllByText("None")).toHaveLength(1);
  });

  it("links to attendance", async () => {
    await show();
    expect(screen.getByRole("link", { name: "Open attendance" })).toHaveAttribute("href", "/attendance");
  });

  it("shows only its own error when the read fails", async () => {
    get.mockRejectedValue(new ApiError(500, "boom"));
    render(await AttendancePanel({ cookie: "cookie" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This panel could not be loaded");
    expect(screen.queryByText("Classes today")).not.toBeInTheDocument();
  });
});
