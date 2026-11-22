import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountChangeDialog } from "./AccountChangeDialog";
import type { User } from "@/lib/types";

const { patch, get, refresh } = vi.hoisted(() => ({ patch: vi.fn(), get: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { patch, get } };
});

import { ApiError } from "@/lib/api";

const student = { id: "s1", name: "Nimal", role: "STUDENT" } as User;
const teacher = { id: "t1", name: "Kamal", role: "TEACHER" } as User;
const marker = { id: "m1", name: "Sunil", role: "MARKER" } as User;
const IDEM = expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) });
const course = { id: "c1", name: "Physics", year: 2026, subjectName: "Physics", isActive: true, upcomingSessions: 2, openExams: 1 };
const blocked = (code: string, details: unknown) => new ApiError(409, "blocked", code, undefined, undefined, details);

beforeEach(() => {
  patch.mockReset().mockResolvedValue({});
  refresh.mockReset();
  get.mockReset().mockResolvedValue({ data: [{ id: "t1", name: "Kamal", role: "TEACHER" }, { id: "t2", name: "Saman", role: "TEACHER" }] });
});

async function open(kind: "role" | "deactivate", user: User) {
  const ui = userEvent.setup();
  render(<AccountChangeDialog kind={kind} user={user} />);
  await ui.click(screen.getByRole("button", { name: kind === "role" ? `Change role for ${user.name}` : `Deactivate ${user.name}` }));
  return ui;
}

describe("role change", () => {
  it("offers only the other staff roles, never the owner or the student role", async () => {
    await open("role", teacher);
    const options = within(screen.getByLabelText("New role")).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Select a role", "Front Desk", "Marker"]);
  });

  it("sends the role, the reason and the actor's password with an idempotency key, then refreshes", async () => {
    const ui = await open("role", marker);
    await ui.selectOptions(screen.getByLabelText("New role"), "TEACHER");
    await ui.type(screen.getByLabelText("Reason"), "Now teaches Chemistry");
    await ui.type(screen.getByLabelText("Your password"), "owner-pass");
    await ui.click(screen.getByRole("button", { name: "Change role" }));

    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/m1/role", { role: "TEACHER", reason: "Now teaches Chemistry", currentPassword: "owner-pass" }, IDEM));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("will not send without a reason", async () => {
    const ui = await open("role", marker);
    await ui.selectOptions(screen.getByLabelText("New role"), "TEACHER");
    await ui.type(screen.getByLabelText("Your password"), "owner-pass");
    await ui.click(screen.getByRole("button", { name: "Change role" }));
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("deactivation", () => {
  it("deactivates a student without asking for a password", async () => {
    const ui = await open("deactivate", student);
    expect(screen.queryByLabelText("Your password")).toBeNull();
    await ui.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/s1/status", { isActive: false }, IDEM));
  });

  it("asks for the password for staff and sends the optional reason only when given", async () => {
    const ui = await open("deactivate", marker);
    await ui.type(screen.getByLabelText("Your password"), "owner-pass");
    await ui.type(screen.getByLabelText("Reason (optional)"), "Left the institute");
    await ui.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/m1/status", { isActive: false, reason: "Left the institute", currentPassword: "owner-pass" }, IDEM));
  });

  it("shows the server's message when the change is refused for another reason", async () => {
    patch.mockRejectedValue(new ApiError(403, "Your password is incorrect.", "ACTOR_PASSWORD_INVALID"));
    const ui = await open("deactivate", marker);
    await ui.type(screen.getByLabelText("Your password"), "wrong");
    await ui.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your password is incorrect.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("hand-over", () => {
  it("lists the classes in the way, asks who takes over, and sends the choice with a fresh idempotency key", async () => {
    patch.mockRejectedValueOnce(blocked("TEACHER_HAS_CLASSES", { courses: [course], markerAllocations: [] }));
    const ui = await open("deactivate", teacher);
    await ui.type(screen.getByLabelText("Your password"), "owner-pass");
    await ui.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Physics 2026")).toBeInTheDocument();
    expect(screen.getByText(/2 sessions coming up · 1 exam waiting for results/)).toBeInTheDocument();
    const receiver = screen.getByLabelText("New teacher for all of these classes");
    expect(within(receiver).queryByRole("option", { name: "Kamal" })).toBeNull(); // not the person leaving
    const send = screen.getByRole("button", { name: "Hand over and deactivate" });
    expect(send).toBeDisabled();

    await ui.selectOptions(receiver, "t2");
    await ui.click(send);

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]![1]).toEqual({ isActive: false, currentPassword: "owner-pass", handoverAllTo: "t2" });
    expect(patch.mock.calls[1]![2].headers["Idempotency-Key"]).not.toBe(patch.mock.calls[0]![2].headers["Idempotency-Key"]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("explains a timetable clash and lets the owner choose someone else", async () => {
    patch
      .mockRejectedValueOnce(blocked("TEACHER_HAS_CLASSES", { courses: [course], markerAllocations: [] }))
      .mockRejectedValueOnce(blocked("HANDOVER_SLOT_CONFLICT", { conflicts: [{ toTeacherId: "t2", courseId: "c1", courseName: "Physics", dayOfWeek: 1, startTime: "16:00", durationMinutes: 60, clashesWith: { courseName: "Maths", startTime: "16:30", durationMinutes: 60 } }] }));
    const ui = await open("deactivate", teacher);
    await ui.type(screen.getByLabelText("Your password"), "owner-pass");
    await ui.click(screen.getByRole("button", { name: "Deactivate" }));
    await ui.selectOptions(await screen.findByLabelText("New teacher for all of these classes"), "t2");
    await ui.click(screen.getByRole("button", { name: "Hand over and deactivate" }));

    expect(await screen.findByText(/Physics, Monday 16:00, overlaps Maths at 16:30/)).toBeInTheDocument();
    expect(screen.getByText("Physics 2026")).toBeInTheDocument(); // the class list stays
    expect(refresh).not.toHaveBeenCalled();
  });

  it("tells a marker what marking is left and offers no way to continue", async () => {
    patch.mockRejectedValueOnce(blocked("MARKER_HAS_ALLOCATIONS", { courses: [], markerAllocations: [{ examId: "e1", examTitle: "Term test", courseName: "Physics 2026" }] }));
    const ui = await open("deactivate", marker);
    await ui.type(screen.getByLabelText("Your password"), "owner-pass");
    await ui.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("This marker still has marking to do.")).toBeInTheDocument();
    expect(screen.getByText("Term test (Physics 2026)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeDisabled();
    expect(get).not.toHaveBeenCalled();
  });
});
