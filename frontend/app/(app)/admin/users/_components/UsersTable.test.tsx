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

const nimal = {
  id: "u1",
  name: "Nimal",
  email: "nimal@x.lk",
  role: "STUDENT",
  indexNumber: 42,
  barcode: "A-0001",
  deletedAt: null,
} as User;
const kamal = { ...nimal, id: "u2", name: "Kamal", role: "TEACHER", indexNumber: 7 } as User;
const owner = { ...nimal, id: "owner-1", name: "Owner", role: "SUPER_ADMIN", indexNumber: 1 } as User;

const baseProps = { users: [nimal], viewerId: "admin-1", viewerRole: "SUPER_ADMIN" as Role };

// Every mutation must carry a UUID Idempotency-Key in the request options.
const IDEM = expect.objectContaining({
  headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
});

beforeEach(() => {
  patch.mockReset().mockResolvedValue({});
  refresh.mockReset();
});

describe("UsersTable — Idempotency-Key on mutations", () => {
  it("sends an Idempotency-Key on activate", async () => {
    const user = userEvent.setup();
    render(<UsersTable {...baseProps} users={[{ ...nimal, deletedAt: "2026-11-01T00:00:00Z" } as User]} />);
    await user.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/users/u1/status", { isActive: true }, IDEM));
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

describe("UsersTable — the actions each viewer is offered", () => {
  it("shows the owner a role change and a deactivate on a teacher, and no role dropdown", () => {
    render(<UsersTable {...baseProps} users={[kamal]} />);
    expect(screen.getByRole("button", { name: "Change role for Kamal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate Kamal" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Role for Kamal")).toBeNull();
  });

  it("offers the owner no role change on a student or on an owner account, but can deactivate them", () => {
    render(<UsersTable {...baseProps} users={[nimal, owner]} />);
    expect(screen.queryByRole("button", { name: /Change role for/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Deactivate Nimal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate Owner" })).toBeInTheDocument();
  });

  it("offers the front desk a deactivate on a student only, and no role change anywhere", () => {
    render(<UsersTable {...baseProps} users={[nimal, kamal]} viewerRole="ADMIN" />);
    expect(screen.getByRole("button", { name: "Deactivate Nimal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate Kamal" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Change role for/ })).toBeNull();
  });

  it("offers nobody anything on their own row", () => {
    render(<UsersTable {...baseProps} users={[{ ...kamal, id: "admin-1" } as User]} />);
    expect(screen.queryByRole("button", { name: /Change role for|Deactivate|Activate/ })).toBeNull();
  });

  it("shows the role as a plain badge", () => {
    render(<UsersTable {...baseProps} users={[kamal]} />);
    expect(screen.getByText("Teacher")).toBeInTheDocument();
  });
});

describe("UsersTable — reset password action", () => {
  it("shows the action where the backend would accept it", () => {
    render(<UsersTable {...baseProps} viewerRole="ADMIN" />);
    expect(screen.getByRole("button", { name: "Reset password for Nimal" })).toBeInTheDocument();
  });

  it("hides it for staff targets when the viewer is front desk, and on the viewer's own row", () => {
    const self = { ...nimal, id: "admin-1", name: "Me" } as User;
    render(<UsersTable {...baseProps} users={[kamal, self]} viewerRole="ADMIN" />);
    expect(screen.queryByRole("button", { name: /Reset password for/ })).toBeNull();
  });
});
