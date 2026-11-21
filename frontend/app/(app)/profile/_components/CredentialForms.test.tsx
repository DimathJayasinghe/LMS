import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialForms } from "./CredentialForms";
import type { User } from "@/lib/types";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { patch, post: vi.fn(), del: vi.fn(), get: vi.fn(), upload: vi.fn() } };
});

const makeUser = (over: Partial<User> = {}): User =>
  ({
    id: "u1",
    indexNumber: 1,
    email: "old@x.com",
    name: "Jane Doe",
    role: "STUDENT",
    createdAt: "2020-01-01T00:00:00.000Z",
    emailChangedAt: null,
    passwordChangedAt: null,
    ...over,
  }) as User;

beforeEach(() => vi.clearAllMocks());

describe("CredentialForms — password cooldown", () => {
  it("locks the password form when changed within the last 7 days", () => {
    render(<CredentialForms user={makeUser({ passwordChangedAt: new Date().toISOString() })} />);
    expect(screen.getByText(/you can change this again on/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update password/i })).not.toBeInTheDocument();
  });

  it("submits a password change when not locked", async () => {
    patch.mockResolvedValueOnce({ data: null });
    const { container } = render(<CredentialForms user={makeUser({ passwordChangedAt: null })} />);

    await userEvent.type(container.querySelector("#password-current")!, "oldpass");
    await userEvent.type(container.querySelector("#password-new")!, "brand-new-pass");
    await userEvent.type(container.querySelector("#password-confirm")!, "brand-new-pass");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/users/me/password", {
        currentPassword: "oldpass",
        newPassword: "brand-new-pass",
      }),
    );
  });

  it("blocks submit and does not call the API when the new passwords differ", async () => {
    const { container } = render(<CredentialForms user={makeUser({ passwordChangedAt: null })} />);

    await userEvent.type(container.querySelector("#password-current")!, "oldpass");
    await userEvent.type(container.querySelector("#password-new")!, "brand-new-pass");
    await userEvent.type(container.querySelector("#password-confirm")!, "different-pass");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });
});
