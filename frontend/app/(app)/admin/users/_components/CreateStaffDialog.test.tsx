import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateStaffDialog } from "./CreateStaffDialog";
import { ApiError } from "@/lib/api";

const { post, refresh } = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post } };
});

const created = {
  data: { user: { id: "u1", name: "Nimal Perera", email: "nimal@example.com", role: "TEACHER" }, temporaryPassword: "Temp-Pass-9xK", mustChangePassword: true },
};

beforeEach(() => { post.mockReset(); refresh.mockReset(); });

async function open() {
  const ui = userEvent.setup();
  render(<CreateStaffDialog />);
  await ui.click(screen.getByRole("button", { name: "Add staff" }));
  return ui;
}
async function fill(ui: ReturnType<typeof userEvent.setup>, extra: { phone?: string } = {}) {
  await ui.type(screen.getByLabelText("Full name"), "Nimal Perera");
  await ui.type(screen.getByLabelText("Email"), "nimal@example.com");
  if (extra.phone) await ui.type(screen.getByLabelText(/Phone/), extra.phone);
  await ui.selectOptions(screen.getByLabelText("Role"), "TEACHER");
  await ui.type(screen.getByLabelText("Your password"), "owner-pass");
}

describe("CreateStaffDialog", () => {
  it("offers only teacher, front desk and marker", async () => {
    await open();
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Select a role", "Teacher", "Front desk", "Marker"]);
  });

  it("creates the account with the owner's password and an idempotency key, and shows the password once", async () => {
    post.mockResolvedValue(created);
    const ui = await open();
    await fill(ui);
    await ui.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/users/staff",
      { name: "Nimal Perera", email: "nimal@example.com", role: "TEACHER", currentPassword: "owner-pass" },
      expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": expect.stringMatching(/^[0-9a-f-]{36}$/) }) }),
    ));
    expect(await screen.findByTestId("temporary-password")).toHaveTextContent("Temp-Pass-9xK");
    expect(screen.getByText(/shown only now/)).toBeInTheDocument();
  });

  it("sends the phone only when one was typed", async () => {
    post.mockResolvedValue(created);
    const ui = await open();
    await fill(ui, { phone: "0771234567" });
    await ui.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(post.mock.calls[0]![1]).toMatchObject({ phone: "0771234567" }));
  });

  it("refreshes the list and forgets the password when the dialog is closed", async () => {
    post.mockResolvedValue(created);
    const ui = await open();
    await fill(ui);
    await ui.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByTestId("temporary-password");
    await ui.click(screen.getByRole("button", { name: "Done" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    await ui.click(screen.getByRole("button", { name: "Add staff" }));
    expect(screen.queryByText("Temp-Pass-9xK")).toBeNull();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("does not refresh the list when nothing was created", async () => {
    const ui = await open();
    await ui.click(screen.getByRole("button", { name: "Cancel" }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the server's refusal, no password, and keeps the form", async () => {
    post.mockRejectedValue(new ApiError(409, "An account with this email already exists.", "EMAIL_ALREADY_EXISTS"));
    const ui = await open();
    await fill(ui);
    await ui.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(screen.queryByTestId("temporary-password")).toBeNull();
    expect(screen.getByLabelText("Full name")).toHaveValue("Nimal Perera");
  });

  it("shows a wrong owner password as an error without leaving the form", async () => {
    post.mockRejectedValue(new ApiError(403, "Your password is incorrect.", "ACTOR_PASSWORD_INVALID"));
    const ui = await open();
    await fill(ui);
    await ui.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your password is incorrect.");
  });
});
