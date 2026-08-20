import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AttendancePage from "./page";
import type { Course, User } from "@/lib/types";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ toString: () => "access_token=test" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));
vi.mock("./_components/AttendanceReport", () => ({
  AttendanceReport: ({ classes }: { classes: Course[] }) => (
    <div data-testid="attendance-report">{classes.map((course) => course.name).join(",")}</div>
  ),
}));
vi.mock("./_components/StaffScanner", () => ({ StaffScanner: () => <div /> }));
vi.mock("./_components/AttendanceQr", () => ({ AttendanceQr: () => <div /> }));

const teacher: User = {
  id: "teacher-1",
  name: "Teacher",
  email: "teacher@example.com",
  role: "TEACHER",
  indexNumber: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const course = (id: string, name: string, teacherId: string): Course => ({
  id,
  name,
  year: 2026,
  description: null,
  monthlyFee: "2500.00",
  isActive: true,
  subjectId: "subject-1",
  teacherId,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(() => {
  get.mockReset().mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve({ data: teacher });
    if (path === "/classes") {
      return Promise.resolve({
        data: [course("own", "Physics", teacher.id), course("other", "Biology", "teacher-2")],
        count: 2,
      });
    }
    throw new Error(`Unexpected API path: ${path}`);
  });
});

describe("AttendancePage teacher view", () => {
  it("mounts attendance reporting with only the teacher's own classes", async () => {
    render(await AttendancePage());

    expect(screen.getByRole("heading", { name: "Attendance reports" })).toBeInTheDocument();
    expect(screen.getByTestId("attendance-report")).toHaveTextContent("Physics");
    expect(screen.getByTestId("attendance-report")).not.toHaveTextContent("Biology");
  });
});
