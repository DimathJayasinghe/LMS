import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrphanedClassesCard } from "./OrphanedClassesCard";
import type { AcademicStaff, OrphanedClassGroup } from "@/lib/types";

const { post, refresh } = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post } };
});

import { ApiError } from "@/lib/api";

const groups: OrphanedClassGroup[] = [
  { teacher: { id: "t1", name: "Ms Perera", role: "TEACHER", deactivated: true }, courses: [{ id: "c1", name: "Physics", year: 2026 }, { id: "c2", name: "Chemistry", year: 2026 }] },
  { teacher: { id: "t3", name: "Mr Silva", role: "MARKER", deactivated: false }, courses: [{ id: "c3", name: "Maths", year: 2026 }] },
];
const teachers: AcademicStaff[] = [{ id: "t2", name: "Saman", role: "TEACHER" }, { id: "t1", name: "Ms Perera", role: "TEACHER" }];

beforeEach(() => { post.mockReset().mockResolvedValue({}); refresh.mockReset(); });

describe("OrphanedClassesCard", () => {
  it("renders nothing when every class has a teacher", () => {
    const { container } = render(<OrphanedClassesCard groups={[]} teachers={teachers} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each leaver with their classes and why they count as gone", () => {
    render(<OrphanedClassesCard groups={groups} teachers={teachers} />);
    expect(screen.getByText("Physics 2026, Chemistry 2026")).toBeInTheDocument();
    expect(screen.getByText("(deactivated)")).toBeInTheDocument();
    expect(screen.getByText("(now Marker)")).toBeInTheDocument();
  });

  it("will not hand over before a teacher is chosen, and never offers the leaver", async () => {
    render(<OrphanedClassesCard groups={groups} teachers={teachers} />);
    expect(screen.getByRole("button", { name: "Hand over the classes of Ms Perera" })).toBeDisabled();
    const options = Array.from((screen.getByLabelText("New teacher for the classes of Ms Perera") as HTMLSelectElement).options).map((option) => option.text);
    expect(options).toEqual(["Select a teacher", "Saman"]);
  });

  it("hands every class of the leaver to the chosen teacher, with an idempotency key, then refreshes", async () => {
    const ui = userEvent.setup();
    render(<OrphanedClassesCard groups={groups} teachers={teachers} />);
    await ui.selectOptions(screen.getByLabelText("New teacher for the classes of Ms Perera"), "t2");
    await ui.click(screen.getByRole("button", { name: "Hand over the classes of Ms Perera" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/users/t1/handover", { handoverAllTo: "t2" }, expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) })));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("names the timetable clashes when the chosen teacher is not free", async () => {
    post.mockRejectedValue(new ApiError(409, "clash", "HANDOVER_SLOT_CONFLICT", undefined, undefined, { conflicts: [{ toTeacherId: "t2", courseId: "c1", courseName: "Physics", dayOfWeek: 1, startTime: "16:00", durationMinutes: 60, clashesWith: { courseName: "Maths", startTime: "16:30", durationMinutes: 60 } }] }));
    const ui = userEvent.setup();
    render(<OrphanedClassesCard groups={groups} teachers={teachers} />);
    await ui.selectOptions(screen.getByLabelText("New teacher for the classes of Ms Perera"), "t2");
    await ui.click(screen.getByRole("button", { name: "Hand over the classes of Ms Perera" }));

    expect(await screen.findByText("Physics, Monday 16:00, overlaps Maths at 16:30")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the server's message for any other refusal", async () => {
    post.mockRejectedValue(new ApiError(400, "Choose active teachers of this organization, other than the one leaving.", "INVALID_HANDOVER_TARGET"));
    const ui = userEvent.setup();
    render(<OrphanedClassesCard groups={groups} teachers={teachers} />);
    await ui.selectOptions(screen.getByLabelText("New teacher for the classes of Ms Perera"), "t2");
    await ui.click(screen.getByRole("button", { name: "Hand over the classes of Ms Perera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose active teachers of this organization");
  });
});
