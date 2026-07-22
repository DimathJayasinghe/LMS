import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  barcode: "LMS-0001",
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
  it("sends an Idempotency-Key on role change", () => {
    render(<UsersTable {...baseProps} />);
    fireEvent.change(screen.getByLabelText("Role for Nimal"), { target: { value: "MARKER" } });
    expect(patch).toHaveBeenCalledWith("/users/u1/role", { role: "MARKER" }, IDEM);
  });

  it("sends an Idempotency-Key on status toggle", () => {
    render(<UsersTable {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(patch).toHaveBeenCalledWith("/users/u1/status", { isActive: false }, IDEM);
  });

  it("sends an Idempotency-Key on barcode save", () => {
    render(<UsersTable {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "LMS-0001" })); // enter edit mode
    fireEvent.change(screen.getByPlaceholderText("LMS-0001"), { target: { value: "LMS-0002" } });
    fireEvent.click(screen.getByRole("button", { name: "Save code" }));
    expect(patch).toHaveBeenCalledWith("/users/u1/barcode", { barcode: "LMS-0002" }, IDEM);
  });
});
