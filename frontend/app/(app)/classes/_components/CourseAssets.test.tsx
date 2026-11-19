import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseAssets } from "./CourseAssets";
import type { Course } from "@/lib/types";

const { post, patch, del } = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post, patch, del } };
});

const course: Course = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Physics Theory",
  year: 2026,
  monthlyFee: "2500.00",
  isActive: true,
  subjectId: "subject-1",
  teacherId: "teacher-1",
  bannerUrl: null,
  bannerAlt: null,
  backdropUrl: null,
  backdropAlt: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({
    width: 1600,
    height: 600,
    close: vi.fn(),
  }));
});

describe("CourseAssets", () => {
  it("presigns, uploads, confirms, and previews a server-controlled banner", async () => {
    post
      .mockResolvedValueOnce({
        data: {
          uploadUrl: "https://signed.example",
          key: `courses/${course.id}/banner/new.png`,
          requiredWidth: 1600,
          requiredHeight: 600,
          maxSizeBytes: 8 * 1024 * 1024,
        },
      })
      .mockResolvedValueOnce({
        data: {
          ...course,
          bannerUrl: `https://cdn.example/courses/${course.id}/banner/new.png`,
          bannerAlt: "Students solving equations",
        },
      });
    const { container } = render(<CourseAssets initialCourse={course} />);
    await userEvent.clear(screen.getByLabelText("Image description", { selector: "input#banner-alt" }));
    await userEvent.type(
      screen.getByLabelText("Image description", { selector: "input#banner-alt" }),
      "Students solving equations",
    );
    const file = new File(["png"], "class art.png", { type: "image/png" });
    fireEvent.change(container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0]!, {
      target: { files: [file] },
    });

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[0]![0]).toBe(`/classes/${course.id}/assets/upload-url`);
    expect(post.mock.calls[1]![1]).toEqual({
      kind: "BANNER",
      key: `courses/${course.id}/banner/new.png`,
      altText: "Students solving equations",
    });
    expect(fetch).toHaveBeenCalledWith("https://signed.example", expect.objectContaining({ method: "PUT" }));
    expect(screen.getByAltText("Students solving equations")).toHaveAttribute(
      "src",
      `https://cdn.example/courses/${course.id}/banner/new.png`,
    );
  });

  it("rejects wrong dimensions before requesting an upload URL", async () => {
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 800,
      height: 300,
      close: vi.fn(),
    } as unknown as ImageBitmap);
    const { container } = render(<CourseAssets initialCourse={course} />);
    fireEvent.change(container.querySelectorAll<HTMLInputElement>('input[type="file"]')[0]!, {
      target: { files: [new File(["png"], "small.png", { type: "image/png" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("must be exactly 1600×600 pixels");
    expect(post).not.toHaveBeenCalled();
  });

  it("removes an existing banner with an idempotency key", async () => {
    const existing = { ...course, bannerUrl: "https://cdn.example/banner.png", bannerAlt: "Physics class" };
    del.mockResolvedValueOnce({ data: { ...existing, bannerUrl: null, bannerAlt: null } });
    render(<CourseAssets initialCourse={existing} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith(
      `/classes/${course.id}/assets/banner`,
      { headers: { "Idempotency-Key": expect.any(String) } },
    ));
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("saves an edited description without replacing the image", async () => {
    const existing = { ...course, bannerUrl: "https://cdn.example/banner.png", bannerAlt: "Old description" };
    patch.mockResolvedValueOnce({ data: { ...existing, bannerAlt: "Updated description" } });
    render(<CourseAssets initialCourse={existing} />);
    const input = screen.getByLabelText("Image description", { selector: "input#banner-alt" });
    await userEvent.clear(input);
    await userEvent.type(input, "Updated description");
    await userEvent.click(screen.getByRole("button", { name: "Save description" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(
      `/classes/${course.id}/assets/banner/alt`,
      { altText: "Updated description" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    ));
  });
});
