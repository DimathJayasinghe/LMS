import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForcedPasswordChangeForm } from "./ForcedPasswordChangeForm";

const { patch, replace, refresh } = vi.hoisted(() => ({ patch: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { patch } };
});

beforeEach(() => { patch.mockReset(); replace.mockReset(); refresh.mockReset(); });

async function fill(ui: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) {
  await ui.type(screen.getByLabelText("Temporary password"), current);
  await ui.type(screen.getByLabelText("New password"), next);
  await ui.type(screen.getByLabelText("Confirm new password"), confirm);
  await ui.click(screen.getByRole("button", { name: "Save new password" }));
}

describe("ForcedPasswordChangeForm", () => {
  it("changes the password and returns to the dashboard", async () => {
    patch.mockResolvedValue({});
    const ui = userEvent.setup();
    render(<ForcedPasswordChangeForm />);
    await fill(ui, "Temp-9xK-pass", "brand-new-pass", "brand-new-pass");
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/me/password", { currentPassword: "Temp-9xK-pass", newPassword: "brand-new-pass" }));
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("does not call the API when the confirmation differs", async () => {
    const ui = userEvent.setup();
    render(<ForcedPasswordChangeForm />);
    await fill(ui, "Temp-9xK-pass", "brand-new-pass", "different-pass");
    expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
    expect(patch).not.toHaveBeenCalled();
  });

  it("shows the server's message and stays on the page when the temporary password is wrong", async () => {
    const { ApiError } = await import("@/lib/api");
    patch.mockImplementation(async () => { throw new ApiError(401, "Current password is incorrect.", "INVALID_CREDENTIALS"); });
    const ui = userEvent.setup();
    render(<ForcedPasswordChangeForm />);
    await fill(ui, "wrong-pass-1", "brand-new-pass", "brand-new-pass");
    expect(await screen.findByRole("alert")).toHaveTextContent("incorrect");
    expect(replace).not.toHaveBeenCalled();
  });
});
