import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import type { User } from "@/lib/types";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post } };
});

const student = { id: "s1", name: "Nimal", role: "STUDENT" } as User;
const teacher = { id: "t1", name: "Kamal", role: "TEACHER" } as User;

beforeEach(() => { post.mockReset(); });

async function open(user: User) {
  const ui = userEvent.setup();
  render(<ResetPasswordDialog user={user} />);
  await ui.click(screen.getByRole("button", { name: `Reset password for ${user.name}` }));
  return ui;
}

describe("ResetPasswordDialog", () => {
  it("resets a student with the identity check and an idempotency key, and shows the password once", async () => {
    post.mockResolvedValue({ data: { temporaryPassword: "Temp-Pass-9xK" } });
    const ui = await open(student);
    expect(screen.queryByLabelText("Your password")).toBeNull();
    await ui.selectOptions(screen.getByLabelText(/how did you confirm/i), "IN_PERSON_CARD");
    await ui.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/users/s1/reset-password",
      { identityCheck: "IN_PERSON_CARD" },
      expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) }),
    ));
    expect(await screen.findByTestId("temporary-password")).toHaveTextContent("Temp-Pass-9xK");
  });

  it("asks a staff reset for the actor's own password and sends it", async () => {
    post.mockResolvedValue({ data: { temporaryPassword: "Another-9xK" } });
    const ui = await open(teacher);
    await ui.selectOptions(screen.getByLabelText(/how did you confirm/i), "OWNER_KNOWS");
    await ui.type(screen.getByLabelText("Your password"), "owner-pass");
    await ui.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(post.mock.calls[0]![1]).toEqual({ identityCheck: "OWNER_KNOWS", currentPassword: "owner-pass" }));
  });

  it("forgets the password when the dialog is closed", async () => {
    post.mockResolvedValue({ data: { temporaryPassword: "Gone-After-Close" } });
    const ui = await open(student);
    await ui.selectOptions(screen.getByLabelText(/how did you confirm/i), "GUARDIAN_PHONE");
    await ui.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByTestId("temporary-password");
    await ui.click(screen.getByRole("button", { name: "Done" }));
    await ui.click(screen.getByRole("button", { name: "Reset password for Nimal" }));
    expect(screen.queryByText("Gone-After-Close")).toBeNull();
  });

  it("shows the server's refusal and no password", async () => {
    const { ApiError } = await import("@/lib/api");
    post.mockImplementation(async () => { throw new ApiError(429, "This account has had too many resets in the last 24 hours.", "RESET_LIMIT_TARGET"); });
    const ui = await open(student);
    await ui.selectOptions(screen.getByLabelText(/how did you confirm/i), "IN_PERSON_CARD");
    await ui.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("too many resets");
    expect(screen.queryByTestId("temporary-password")).toBeNull();
  });
});
