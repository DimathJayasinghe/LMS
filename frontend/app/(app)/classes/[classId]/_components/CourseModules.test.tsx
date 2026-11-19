import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseModules } from "./CourseModules";
import type { CourseMaterial, CourseModule } from "@/lib/types";

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get, post, patch, del } };
});

const classId = "11111111-1111-4111-8111-111111111111";
const courseModule: CourseModule = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Mechanics",
  description: null,
  position: 0,
  status: "DRAFT",
  releaseAt: null,
  courseId: classId,
  materials: [],
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

const material: CourseMaterial = {
  id: "33333333-3333-4333-8333-333333333333",
  type: "FILE",
  title: "Lesson notes",
  description: null,
  position: 0,
  fileName: "lesson-notes.pdf",
  contentType: "application/pdf",
  sizeBytes: 2048,
  downloadable: true,
  version: 1,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("CourseModules", () => {
  it("lets course staff create an ordered draft module with idempotency", async () => {
    post.mockResolvedValueOnce({ data: courseModule });
    render(<CourseModules classId={classId} initialModules={[]} canManage />);
    await userEvent.type(screen.getByLabelText("New module title"), "Mechanics");
    await userEvent.click(screen.getByRole("button", { name: "Add module" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      `/classes/${classId}/modules`,
      { title: "Mechanics" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    ));
    expect(screen.getByRole("heading", { name: "Mechanics" })).toBeInTheDocument();
  });

  it("presigns, uploads, and confirms a private material", async () => {
    post
      .mockResolvedValueOnce({ data: { uploadUrl: "https://signed-upload.example", key: `course-materials/${classId}/${courseModule.id}/file.pdf` } })
      .mockResolvedValueOnce({ data: material });
    render(<CourseModules classId={classId} initialModules={[courseModule]} canManage />);
    await userEvent.type(screen.getByLabelText("Material title for Mechanics"), "Lesson notes");
    const file = new File(["%PDF-1.7\n%%EOF"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("File for Mechanics"), { target: { files: [file] } });
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledWith("https://signed-upload.example", expect.objectContaining({ method: "PUT", body: file }));
    expect(post.mock.calls[1]).toEqual([
      `/classes/${classId}/modules/${courseModule.id}/materials/confirm`,
      { key: `course-materials/${classId}/${courseModule.id}/file.pdf`, title: "Lesson notes", fileName: "notes.pdf" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    ]);
    expect(screen.getByText(/lesson-notes\.pdf/)).toBeInTheDocument();
  });

  it("requests a server-authorized download without exposing storage keys", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    get.mockResolvedValueOnce({ data: { url: "https://signed-download.example", fileName: "lesson-notes.pdf" } });
    render(<CourseModules classId={classId} initialModules={[{ ...courseModule, status: "PUBLISHED", materials: [material] }]} canManage={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith(
      `/classes/${classId}/modules/${courseModule.id}/materials/${material.id}/download`,
    ));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
