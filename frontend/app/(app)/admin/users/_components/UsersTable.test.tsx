import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsersTable } from "./UsersTable";
import type { Role, User } from "@/lib/types";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { patch, get: vi.fn(), post: vi.fn(), upload: vi.fn(), del: vi.fn() } };
});

const roles: Role[] = ["SUPER_ADMIN", "TEACHER", "ADMIN", "MARKER", "STUDENT"];

const nimal = {
  id: "u1",
  name: "Nimal",
  email: "nimal@x.lk",
  role: "STUDENT",
  indexNumber: 42,
  barcode: "A-0001",
  deletedAt: null,
} as User;

const baseProps = { users: [nimal], canChangeRole: true, viewerId: "admin-1", roles };

// Every mutation must carry a UUID Idempotency-Key in the request options.
const IDEM = expect.objectContaining({
  headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
});

beforeEach(() => {
  patch.mockReset().mockResolvedValue({});
  refresh.mockReset();
});

describe("UsersTable — Idempotency-Key on mutations", () => {
  it("sends an Idempotency-Key on role change", async () => {
    const user = userEvent.setup();
    render(<UsersTable {...baseProps} />);
    await user.selectOptions(screen.getByLabelText("Role for Nimal"), "MARKER");
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/u1/role", { role: "MARKER" }, IDEM));
  });

  it("sends an Idempotency-Key on status toggle", async () => {
    const user = userEvent.setup();
    render(<UsersTable {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/u1/status", { isActive: false }, IDEM));
  });

  it("sends an Idempotency-Key on barcode save", async () => {
    const user = userEvent.setup();
    render(<UsersTable {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "A-0001" })); // enter edit mode
    await user.clear(screen.getByPlaceholderText("A-0001"));
    await user.type(screen.getByPlaceholderText("A-0001"), "A-0002");
    await user.click(screen.getByRole("button", { name: "Save code" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/u1/barcode", { barcode: "A-0002" }, IDEM));
  });
});
