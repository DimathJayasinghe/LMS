import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseForm } from "./CourseForm";

const { post, push, refresh } = vi.hoisted(() => ({
  post: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post, patch: vi.fn() } };
});

const subject = {
  id: "subject-1",
  name: "Physics",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { id: "course-1" } });
});

describe("CourseForm teacher creation", () => {
  it("creates inside an assigned subject without allowing client-side owner selection", async () => {
    const user = userEvent.setup();
    render(
      <CourseForm
        viewerRole="TEACHER"
        subjects={[subject]}
        teachers={[]}
        allowedTeacherIdsBySubject={{}}
      />,
    );

    expect(screen.queryByLabelText("Assigned teacher")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Class name"), "2026 Theory");
    await user.clear(screen.getByLabelText("Monthly fee (LKR)"));
    await user.type(screen.getByLabelText("Monthly fee (LKR)"), "2500");
    await user.click(screen.getByRole("button", { name: "Create class" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/classes",
      expect.objectContaining({
        name: "2026 Theory",
        subjectId: "subject-1",
        monthlyFee: 2500,
      }),
      { headers: { "Idempotency-Key": expect.any(String) } },
    ));
    expect(post.mock.calls[0]![1]).not.toHaveProperty("teacherId");
    expect(post.mock.calls[0]![1]).not.toHaveProperty("bannerUrl");
    expect(post.mock.calls[0]![1]).not.toHaveProperty("backdropUrl");
    expect(push).toHaveBeenCalledWith("/classes/course-1");
  });

  it("disables creation when no subjects have been assigned", () => {
    render(
      <CourseForm
        viewerRole="TEACHER"
        subjects={[]}
        teachers={[]}
        allowedTeacherIdsBySubject={{}}
      />,
    );

    expect(screen.getByRole("button", { name: "Create class" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "No assigned subjects" })).toBeInTheDocument();
  });
});
