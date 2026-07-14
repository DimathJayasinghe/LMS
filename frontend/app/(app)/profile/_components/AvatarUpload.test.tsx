import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarUpload } from "./AvatarUpload";
import type { User } from "@/lib/types";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const { post, del } = vi.hoisted(() => ({ post: vi.fn(), del: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post, del, get: vi.fn(), patch: vi.fn(), upload: vi.fn() } };
});

const user = { id: "u1", name: "Jane Doe", profileImage: null } as User;

const renderAvatar = () => render(<AvatarUpload user={user} />);
const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const jpg = () => new File([new Uint8Array([1, 2, 3])], "me.jpg", { type: "image/jpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:preview"), writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("AvatarUpload", () => {
  it("presigns, PUTs, then confirms with the returned key on success", async () => {
    post
      .mockResolvedValueOnce({ data: { uploadUrl: "https://r2/put", key: "avatars/u1/x.jpg", expiresAt: "" } })
      .mockResolvedValueOnce({ data: { profileImage: "https://cdn/avatars/u1/x.jpg" } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderAvatar();
    await userEvent.upload(fileInput(container), jpg());

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        "/users/me/avatar/upload-url",
        expect.objectContaining({ contentType: "image/jpeg", fileName: "me.jpg" }),
      );
      expect(post).toHaveBeenCalledWith("/users/me/avatar/confirm", { key: "avatars/u1/x.jpg" });
    });
    // PUT went to the presigned URL, and the page refreshed so the TopBar updates.
    expect(fetchMock).toHaveBeenCalledWith("https://r2/put", expect.objectContaining({ method: "PUT" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("does NOT confirm and shows an error when the PUT fails", async () => {
    post.mockResolvedValueOnce({
      data: { uploadUrl: "https://r2/put", key: "avatars/u1/x.jpg", expiresAt: "" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const { container } = renderAvatar();
    await userEvent.upload(fileInput(container), jpg());

    await waitFor(() => expect(screen.getByText(/upload failed/i)).toBeInTheDocument());
    expect(post).toHaveBeenCalledTimes(1); // upload-url only; confirm never called
    expect(post).not.toHaveBeenCalledWith("/users/me/avatar/confirm", expect.anything());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rejects an oversized image before presigning", async () => {
    // 5 MB + 1 byte — passes the accept filter, trips the client-side size guard.
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    const { container } = renderAvatar();
    await userEvent.upload(fileInput(container), big);
    expect(await screen.findByText(/exceeds the 5 MB limit/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
