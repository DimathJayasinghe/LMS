import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "./page";
import type { FinancialReport, User } from "@/lib/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ toString: () => "access_token=test" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));
vi.mock("./_components/ReportCharts", () => ({
  RevenueTrendChart: () => <div data-testid="trend-chart" />,
  CourseBreakdownChart: () => <div data-testid="course-chart" />,
  MethodDonut: () => <div data-testid="method-chart" />,
}));

const report: FinancialReport = {
  month: "2026-08",
  trend: [{ month: "2026-08", collected: "5000.00", paidCount: 2 }],
  byCourse: [{ courseId: "course-1", name: "Physics", year: 2026, collected: "5000.00", paidCount: 2 }],
  byTeacher: [{ teacherId: "teacher-1", name: "Ms Perera", collected: "5000.00", paidCount: 2 }],
  byMethod: [{ method: "ONLINE", collected: "5000.00", paidCount: 2 }],
  outstanding: { count: 1, expected: "2500.00" },
};

const user = (role: User["role"]): User => ({
  id: role === "TEACHER" ? "teacher-1" : "super-admin-1",
  name: role === "TEACHER" ? "Ms Perera" : "Owner",
  email: `${role.toLowerCase()}@example.com`,
  role,
  indexNumber: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(() => {
  get.mockReset();
});

describe("ReportsPage role scoping", () => {
  it("shows a teacher only aggregate reporting for their accessible classes", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve({ data: user("TEACHER") });
      if (path === "/classes") return Promise.resolve({ data: [{ id: "course-1", name: "Physics", year: 2026, teacherId: "teacher-1" }], count: 1 });
      if (path === "/payments/reports?month=2026-08&courseId=course-1") return Promise.resolve({ data: report });
      throw new Error(`Unexpected API path: ${path}`);
    });

    render(await ReportsPage({ searchParams: Promise.resolve({ month: "2026-08", teacherId: "teacher-2", courseId: "course-1" }) }));

    expect(screen.getByText(/for your classes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Teacher")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Class")).toHaveValue("course-1");
    expect(get.mock.calls.map(([path]) => String(path)).every((path) => !path.includes("teacher-2"))).toBe(true);
  });

  it("lets a super admin filter global aggregates and inspect the teacher breakdown", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve({ data: user("SUPER_ADMIN") });
      if (path === "/classes") return Promise.resolve({ data: [{ id: "course-1", name: "Physics", year: 2026, teacherId: "teacher-1" }], count: 1 });
      if (path === "/users/academic-staff?role=TEACHER") return Promise.resolve({ data: [{ id: "teacher-1", name: "Ms Perera", role: "TEACHER" }], count: 1 });
      if (path === "/payments/reports?month=2026-08&teacherId=teacher-1&courseId=course-1") return Promise.resolve({ data: report });
      throw new Error(`Unexpected API path: ${path}`);
    });

    render(await ReportsPage({ searchParams: Promise.resolve({ month: "2026-08", teacherId: "teacher-1", courseId: "course-1" }) }));

    expect(screen.getByLabelText("Teacher")).toHaveValue("teacher-1");
    expect(screen.getByRole("heading", { name: "By teacher" })).toBeInTheDocument();
    expect(screen.getAllByText("Ms Perera").length).toBeGreaterThan(0);
  });
});
