import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffScanner } from "./StaffScanner";
import { ApiError } from "@/lib/api";
import type { AttendanceRecord, ClassSession, Course, User } from "@/lib/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get, post, patch: vi.fn(), upload: vi.fn(), del: vi.fn() } };
});
// Isolate the webcam (getUserMedia/zxing can't run in jsdom).
vi.mock("@/components/custom/QrCamera", () => ({ QrCamera: () => null }));

const classes: Course[] = [
  {
    id: "c1",
    name: "Physics",
    year: 2026,
    monthlyFee: "2500",
    isActive: true,
    subjectId: "s",
    teacherId: "t",
    createdAt: "",
    updatedAt: "",
  },
];

const sessions: ClassSession[] = [
  {
    id: "s1",
    title: "Lecture 1",
    classType: "PHYSICAL",
    date: new Date().toISOString(),
    durationMinutes: 60,
    courseId: "c1",
    createdAt: "",
    updatedAt: "",
  },
];

const students: User[] = [
  { id: "u9", name: "Kamal", email: "k@x.lk", role: "STUDENT", indexNumber: 99, createdAt: "" } as User,
];

const rec = (id: string, userId: string, name: string, index: number): AttendanceRecord => ({
  id,
  source: "BARCODE",
  scannedAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  userId,
  classSessionId: "s1",
  createdAt: "",
  updatedAt: "",
  user: { id: userId, name, email: "x@y.lk", indexNumber: index },
});

beforeEach(() => {
  get.mockReset().mockImplementation((path: string) => {
    if (path.startsWith("/classes/c1/sessions"))
      return Promise.resolve({ data: sessions, count: 1 });
    if (path.startsWith("/attendance/session/")) return Promise.resolve({ data: [], count: 0 });
    if (path.startsWith("/users?")) return Promise.resolve({ data: students, count: 1 });
    return Promise.resolve({ data: [], count: 0 });
  });
  post.mockReset();
});

async function pickSession(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Select class"), "c1");
  await screen.findByRole("option", { name: /Lecture 1/ });
  await user.selectOptions(screen.getByLabelText("Select session"), "s1");
}

describe("StaffScanner — session gating", () => {
  it("disables the scan field until a session is picked, then enables it", async () => {
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} />);
    expect(screen.getByLabelText("Scan code")).toBeDisabled();
    await pickSession(user);
    expect(screen.getByLabelText("Scan code")).toBeEnabled();
  });
});

describe("StaffScanner — wedge scan", () => {
  it("POSTs the scan on Enter and adds the student to the roster", async () => {
    post.mockResolvedValue({ data: rec("a1", "u1", "Nimal", 42) });
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Scan code"), "LMS-042{Enter}");

    expect(post).toHaveBeenCalledWith("/attendance/scan", {
      barcode: "LMS-042",
      classSessionId: "s1",
    });
    expect(await screen.findByText("Nimal")).toBeInTheDocument();
    expect(screen.getByText(/checked in/)).toBeInTheDocument();
  });

  it("maps BARCODE_NOT_FOUND to an inline error and leaves the roster empty", async () => {
    post.mockRejectedValueOnce(new ApiError(404, "nope", "BARCODE_NOT_FOUND"));
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Scan code"), "BAD{Enter}");
    expect(await screen.findByText("No student found for this code.")).toBeInTheDocument();
  });

  it("dedupes the roster when the same student is scanned twice", async () => {
    post.mockResolvedValue({ data: rec("a1", "u1", "Nimal", 42) });
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} />);
    await pickSession(user);

    const scan = screen.getByLabelText("Scan code");
    await user.type(scan, "LMS-042{Enter}");
    await screen.findByText("Nimal");
    await user.type(scan, "LMS-042{Enter}");

    const roster = screen.getByText("Checked in").closest("div")!.parentElement!;
    expect(within(roster).getAllByText("Nimal")).toHaveLength(1);
  });
});

describe("StaffScanner — manual mark", () => {
  it("searches students and marks the chosen one via /attendance/manual", async () => {
    post.mockResolvedValue({ data: rec("a2", "u9", "Kamal", 99) });
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Search student"), "Kamal");
    const markBtn = await screen.findByRole("button", { name: "Mark" });
    await user.click(markBtn);

    expect(post).toHaveBeenCalledWith("/attendance/manual", {
      userId: "u9",
      classSessionId: "s1",
    });
    const roster = screen.getByText("Checked in").closest("div")!.parentElement!;
    expect(await within(roster).findByText("Kamal")).toBeInTheDocument();
  });
});
