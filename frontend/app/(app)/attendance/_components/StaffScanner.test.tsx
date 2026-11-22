import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffScanner } from "./StaffScanner";
import { ApiError } from "@/lib/api";
import type { AttendanceRecord, ClassSession, Course, Institute, ScanContext, User } from "@/lib/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get, post, patch: vi.fn(), upload: vi.fn(), del: vi.fn() } };
});
// Isolate the webcam (getUserMedia/zxing can't run in jsdom).
vi.mock("@/components/custom/QrCamera", () => ({
  QrCamera: ({ onDecode }: { onDecode: (value: string) => void }) => (
    <button type="button" onClick={() => onDecode("LMS-QR-042")}>Decode QR</button>
  ),
}));

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

const institutes: Institute[] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Nugegoda Centre",
    code: "NUG",
    city: "Nugegoda",
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
];

const sessions: ClassSession[] = [
  {
    id: "s1",
    hasRecording: false,
    title: "Lecture 1",
    classType: "PHYSICAL",
    date: new Date().toISOString(),
    durationMinutes: 60,
    liveScheduled: false,
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

const contextFor = (name: string, index: number, patch: Partial<ScanContext> = {}): ScanContext => ({
  enrollmentState: "ENROLLED",
  paidThisMonth: true,
  covered: "PAID",
  month: "2026-11",
  graceUntil: "2026-11-10",
  warnings: [],
  student: { name, indexNumber: index, profileImage: null },
  ...patch,
});
const scanned = (id: string, userId: string, name: string, index: number, patch: Partial<ScanContext> = {}) => ({
  data: { ...rec(id, userId, name, index), context: contextFor(name, index, patch) },
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
  await user.selectOptions(screen.getByLabelText("Select institute"), institutes[0]!.id);
  await user.selectOptions(screen.getByLabelText("Select class"), "c1");
  await screen.findByRole("option", { name: /Lecture 1/ });
  await user.selectOptions(screen.getByLabelText("Select session"), "s1");
}

describe("StaffScanner — session gating", () => {
  it("disables the scan field until a session is picked, then enables it", async () => {
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    expect(screen.getByLabelText("Scan code")).toBeDisabled();
    expect(screen.getByLabelText("Select class")).toBeDisabled();
    await pickSession(user);
    expect(screen.getByLabelText("Scan code")).toBeEnabled();
  });
});

describe("StaffScanner — wedge scan", () => {
  it("POSTs the scan on Enter and adds the student to the roster", async () => {
    post.mockResolvedValue(scanned("a1", "u1", "Nimal", 42));
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Scan code"), "LMS-042{Enter}");

    expect(post).toHaveBeenCalledWith("/attendance/scan", {
      barcode: "LMS-042",
      classSessionId: "s1",
      instituteId: institutes[0]!.id,
      source: "BARCODE",
    });
    // The roster row and the result card both name the student.
    expect(await screen.findAllByText("Nimal")).toHaveLength(2);
    expect(screen.getByText(/checked in/)).toBeInTheDocument();
  });

  it("maps BARCODE_NOT_FOUND to an inline error and leaves the roster empty", async () => {
    post.mockRejectedValueOnce(new ApiError(404, "nope", "BARCODE_NOT_FOUND"));
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Scan code"), "BAD{Enter}");
    expect(await screen.findByText("No student found for this code.")).toBeInTheDocument();
  });

  it("maps AMBIGUOUS_CODE to a message that sends the desk to name or index search", async () => {
    post.mockRejectedValueOnce(new ApiError(409, "dup", "AMBIGUOUS_CODE"));
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Scan code"), "DUP{Enter}");
    expect(
      await screen.findByText("This code matches more than one student. Search by name or index number instead."),
    ).toBeInTheDocument();
  });

  it("dedupes the roster when the same student is scanned twice", async () => {
    post.mockResolvedValue(scanned("a1", "u1", "Nimal", 42));
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);

    const scan = screen.getByLabelText("Scan code");
    await user.type(scan, "LMS-042{Enter}");
    await screen.findAllByText("Nimal");
    await user.type(scan, "LMS-042{Enter}");

    const roster = screen.getByText("Checked in").closest("div")!.parentElement!;
    expect(within(roster).getAllByText("Nimal")).toHaveLength(1);
  });

  it("shows the face-and-state card with the warnings from the scan", async () => {
    post.mockResolvedValue(scanned("a1", "u1", "Nimal", 42, { enrollmentState: "NOT_ENROLLED", paidThisMonth: false, covered: "UNPAID", warnings: ["NOT_ENROLLED"] }));
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Scan code"), "LMS-042{Enter}");

    expect(await screen.findByText("Not enrolled in this class")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enrol" })).toHaveAttribute("href", "/classes/c1");
    expect(screen.getByText("No photo on file")).toBeInTheDocument();
  });

  it.each([
    ["SCAN_BLOCKED_NOT_ENROLLED", 403, /not enrolled in this class, so nothing was recorded/i],
    ["SCAN_BLOCKED_UNPAID", 402, /fee is not covered, so nothing was recorded/i],
  ])("maps %s to a refusal that says nothing was recorded, and clears the previous card", async (code, status, message) => {
    post.mockResolvedValueOnce(scanned("a1", "u1", "Nimal", 42, { paidThisMonth: false, covered: "UNPAID", warnings: ["FEE_UNPAID"] }));
    post.mockRejectedValueOnce(new ApiError(status, "refused", code));
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Scan code"), "LMS-042{Enter}");
    expect(await screen.findByText(/2026-11 fee is not paid/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Scan code"), "LMS-043{Enter}");

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/2026-11 fee is not paid/)).not.toBeInTheDocument();
  });

  it("drops the card when another session is picked", async () => {
    post.mockResolvedValue(scanned("a1", "u1", "Nimal", 42, { paidThisMonth: false, covered: "UNPAID", warnings: ["FEE_UNPAID"] }));
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);
    await user.type(screen.getByLabelText("Scan code"), "LMS-042{Enter}");
    await screen.findByText(/2026-11 fee is not paid/);

    await user.selectOptions(screen.getByLabelText("Select session"), "");

    expect(screen.queryByText(/2026-11 fee is not paid/)).not.toBeInTheDocument();
  });
});

describe("StaffScanner - camera scan", () => {
  it("tags a camera decode as QR", async () => {
    post.mockResolvedValue({ data: { ...scanned("a1", "u1", "Nimal", 42).data, source: "QR" } });
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);

    await user.click(screen.getByRole("button", { name: "Turn camera on" }));
    await user.click(screen.getByRole("button", { name: "Decode QR" }));

    expect(post).toHaveBeenCalledWith("/attendance/scan", {
      barcode: "LMS-QR-042",
      classSessionId: "s1",
      instituteId: institutes[0]!.id,
      source: "QR",
    });
    expect(await screen.findByText("QR scan")).toBeInTheDocument();
  });

  it("shows a session/institute mismatch as an actionable error", async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, "mismatch", "SESSION_INSTITUTE_MISMATCH"),
    );
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
    await pickSession(user);

    await user.type(screen.getByLabelText("Scan code"), "INST-001{Enter}");

    expect(
      await screen.findByText("This session is scheduled at a different institute."),
    ).toBeInTheDocument();
  });
});

describe("StaffScanner — manual mark", () => {
  it("searches students and marks the chosen one via /attendance/manual", async () => {
    post.mockResolvedValue({ data: rec("a2", "u9", "Kamal", 99) });
    const user = userEvent.setup();
    render(<StaffScanner classes={classes} institutes={institutes} />);
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
