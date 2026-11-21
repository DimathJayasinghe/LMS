import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomReconciliationPanel } from "./ZoomReconciliationPanel";
import type { AttendanceReconciliation, ClassSession } from "@/lib/types";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get, post } };
});

const session: ClassSession = {
  id: "session-1",
  hasRecording: false,
  title: "Physics revision",
  classType: "ONLINE",
  date: "2026-08-17T10:00:00.000Z",
  durationMinutes: 60,
  zoomMeetingId: "123456789",
  liveScheduled: true,
  courseId: "course-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const preview: AttendanceReconciliation = {
  sessionId: session.id,
  zoomMeetingId: "123456789",
  summary: {
    zoomRows: 2,
    matchedStudents: 1,
    alreadyRecorded: 0,
    missing: 1,
    unmatched: 1,
    ignored: 0,
  },
  participants: [{
    userId: "student-1",
    name: "Nimal Perera",
    email: "nimal@example.com",
    indexNumber: 42,
    firstJoinAt: "2026-08-17T10:00:00.000Z",
    lastLeaveAt: "2026-08-17T10:45:00.000Z",
    durationSeconds: 2700,
    occurrences: 1,
    status: "MISSING",
  }],
  unmatched: [{
    name: "Other Student (#99)",
    email: null,
    reason: "NOT_ENROLLED",
    occurrences: 1,
  }],
};

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: preview });
  post.mockReset().mockResolvedValue({ data: { ...preview, applied: 1 } });
});

describe("ZoomReconciliationPanel", () => {
  it("previews differences and applies missing rows with an idempotency key", async () => {
    const user = userEvent.setup();
    const onSynced = vi.fn().mockResolvedValue(undefined);
    render(<ZoomReconciliationPanel session={session} onSynced={onSynced} />);

    await user.click(screen.getByRole("button", { name: "Preview Zoom" }));

    expect(await screen.findByText("Nimal Perera · #42")).toBeInTheDocument();
    expect(screen.getByText(/not actively enrolled in this class/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sync 1 missing" }));

    expect(post).toHaveBeenCalledWith(
      "/attendance/session/session-1/reconciliation",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(await screen.findByText("1 missing attendance record(s) added.")).toBeInTheDocument();
    expect(onSynced).toHaveBeenCalledOnce();
  });
});
