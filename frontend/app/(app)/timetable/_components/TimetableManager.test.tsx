import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Course, Institute } from "@/lib/types";
import { TimetableManager } from "./TimetableManager";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { post: mocks.post, patch: mocks.patch, del: mocks.del } };
});

const courses = [{ id: "course-1", name: "Physics", year: 2026 }] as Course[];
const institutes = [{ id: "institute-1", name: "Colombo", isActive: true }] as Institute[];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ status: "success", data: {} });
});

describe("TimetableManager", () => {
  it("requires an explicit mode and sends simulcast as null", async () => {
    const user = userEvent.setup();
    render(<TimetableManager courses={courses} institutes={institutes} slots={[]} />);
    await user.selectOptions(screen.getByLabelText("Class"), "course-1");
    await user.type(screen.getByLabelText("Start time"), "10:00");
    await user.click(screen.getByRole("button", { name: /add slot/i }));
    expect(mocks.post).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Mode"), "SIMULCAST");
    await user.click(screen.getByRole("button", { name: /add slot/i }));
    expect(mocks.post).toHaveBeenCalledWith("/timetable/slots", expect.objectContaining({ classType: null }), expect.anything());
  });

  it("creates a recurring slot with an idempotency key", async () => {
    const user = userEvent.setup();
    render(<TimetableManager courses={courses} institutes={institutes} slots={[]} />);

    await user.selectOptions(screen.getByLabelText("Class"), "course-1");
    await user.type(screen.getByLabelText("Optional title"), "Monday revision");
    await user.type(screen.getByLabelText("Start time"), "10:00");
    await user.selectOptions(screen.getByLabelText("Mode"), "ONLINE");
    await user.click(screen.getByRole("button", { name: /add slot/i }));

    expect(mocks.post).toHaveBeenCalledWith(
      "/timetable/slots",
      expect.objectContaining({
        courseId: "course-1",
        title: "Monday revision",
        dayOfWeek: 1,
        startTime: "10:00",
        durationMinutes: 60,
        classType: "ONLINE",
      }),
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows a conflict response inline and keeps the form available", async () => {
    mocks.post.mockRejectedValueOnce(new ApiError(409, "This time overlaps an active slot.", "TIMETABLE_CONFLICT"));
    const user = userEvent.setup();
    render(<TimetableManager courses={courses} institutes={institutes} slots={[]} />);

    await user.selectOptions(screen.getByLabelText("Class"), "course-1");
    await user.type(screen.getByLabelText("Start time"), "10:00");
    await user.selectOptions(screen.getByLabelText("Mode"), "ONLINE");
    await user.click(screen.getByRole("button", { name: /add slot/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This time overlaps an active slot.");
    expect(screen.getByRole("button", { name: /add slot/i })).toBeEnabled();
  });

  it("previews before generation and idempotently generates only missing sessions", async () => {
    mocks.post
      .mockResolvedValueOnce({
        status: "success",
        data: { rows: [], createCount: 2, existingCount: 1 },
      })
      .mockResolvedValueOnce({ status: "success", data: { created: 2, skipped: 1 } });
    const user = userEvent.setup();
    render(<TimetableManager courses={courses} institutes={institutes} slots={[]} />);

    await user.click(screen.getByRole("button", { name: /preview generation/i }));
    expect(await screen.findByText("2 new; 1 already generated.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /generate 2 sessions/i }));

    expect(mocks.post.mock.calls[0]?.[0]).toBe("/timetable/generate/preview");
    expect(mocks.post.mock.calls[1]?.[0]).toBe("/timetable/generate");
    expect(mocks.post.mock.calls[1]?.[2]).toEqual({
      headers: { "Idempotency-Key": expect.any(String) },
    });
  });
});
