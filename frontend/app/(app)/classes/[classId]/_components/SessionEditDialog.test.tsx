import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { ClassSession } from "@/lib/types";
import { SessionEditDialog } from "./SessionEditDialog";

const mocks = vi.hoisted(() => ({ patch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/api", () => ({ api: { patch: mocks.patch }, ApiError: class extends Error {} }));

beforeEach(() => { vi.clearAllMocks(); mocks.patch.mockResolvedValue({}); });

it("saves a simulcast session and warns about an existing meeting", async () => {
  const user = userEvent.setup();
  const session = { id: "session-1", date: "2026-11-21T04:30:00.000Z", durationMinutes: 60, classType: null, liveScheduled: true } as ClassSession;
  render(<SessionEditDialog classId="course-1" session={session} />);
  await user.click(screen.getByRole("button", { name: /edit session/i }));
  expect(screen.getByText(/does not move.*zoom/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /save session/i }));
  expect(mocks.patch).toHaveBeenCalledWith("/classes/course-1/sessions/session-1", expect.objectContaining({ classType: null, durationMinutes: 60, date: "2026-11-21T04:30:00.000Z" }), { headers: { "Idempotency-Key": expect.any(String) } });
  expect(mocks.refresh).toHaveBeenCalled();
});
