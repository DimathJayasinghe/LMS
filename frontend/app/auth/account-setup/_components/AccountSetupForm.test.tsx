import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSetupForm } from "./AccountSetupForm";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const { post, del } = vi.hoisted(() => ({ post: vi.fn(), del: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post, del, get: vi.fn(), patch: vi.fn(), upload: vi.fn() } };
});

const renderForm = () =>
  render(
    <AccountSetupForm
      institutes={[]}
      initialBarcodes={[]}
      initialSetupCompleted={false}
      initialNicFrontUploaded={false}
      initialNicBackUploaded={false}
    />,
  );

const fileInputs = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('input[type="file"]')) as HTMLInputElement[];

const jpg = () => new File([new Uint8Array([1, 2, 3])], "nic.jpg", { type: "image/jpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:preview"), writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true });
});
afterEach(() => vi.restoreAllMocks());

describe("AccountSetupForm — NIC upload confirm", () => {
  it("confirms after a successful PUT, then shows the preview", async () => {
    post
      .mockResolvedValueOnce({
        data: { uploadUrl: "https://r2.example/put", key: "nic/u/front-nic.jpg", setupCompleted: false },
      })
      .mockResolvedValueOnce({ data: { setupCompleted: false } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { container } = renderForm();
    await userEvent.upload(fileInputs(container)[0]!, jpg());

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith("/users/me/nic/upload-url", expect.objectContaining({ side: "FRONT" }));
      expect(post).toHaveBeenCalledWith("/users/me/nic/confirm", {
        side: "FRONT",
        key: "nic/u/front-nic.jpg",
      });
    });
    expect(await screen.findByAltText(/NIC — front preview/i)).toBeInTheDocument();
  });

  it("does NOT confirm or mark done when the browser PUT fails", async () => {
    post.mockResolvedValueOnce({
      data: { uploadUrl: "https://r2.example/put", key: "nic/u/front-nic.jpg", setupCompleted: false },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const { container } = renderForm();
    await userEvent.upload(fileInputs(container)[0]!, jpg());

    await waitFor(() => expect(screen.getByText(/upload failed/i)).toBeInTheDocument());
    // confirm was never called; no preview rendered
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalledWith("/users/me/nic/confirm", expect.anything());
    expect(screen.queryByAltText(/NIC — front preview/i)).not.toBeInTheDocument();
  });
});
