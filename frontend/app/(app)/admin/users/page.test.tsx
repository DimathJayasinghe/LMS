import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./page";
import { OrphanedClassesCard } from "./_components/OrphanedClassesCard";

const { get, redirect, redirectSignal } = vi.hoisted(() => {
  const redirectSignal = new Error("redirected");
  return { get: vi.fn(), redirectSignal, redirect: vi.fn(() => { throw redirectSignal; }) };
});
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ toString: () => "cookie" }) }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => { if (error === redirectSignal) throw error; },
}));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: { get } }));

const group = { teacher: { id: "t1", name: "Ms Perera", role: "TEACHER", deactivated: true }, courses: [{ id: "c1", name: "Physics", year: 2026 }] };
const teacher = { id: "t2", name: "Saman", role: "TEACHER" };

const serve = (role: string, over: Record<string, unknown> = {}) => get.mockImplementation((path: string) => {
  if (path === "/auth/me") return Promise.resolve({ data: { id: "u1", role } });
  if (path.startsWith("/users?")) return Promise.resolve({ status: "success", data: [], count: 0 });
  if (path === "/users/orphaned-classes") return over.orphaned instanceof Error ? Promise.reject(over.orphaned) : Promise.resolve({ status: "success", data: [group], count: 1 });
  if (path === "/users/academic-staff?role=TEACHER") return Promise.resolve({ status: "success", data: [teacher], count: 1 });
  return Promise.reject(new Error(`unexpected ${path}`));
});

const cardProps = (node: unknown): { groups: unknown[]; teachers: unknown[] } | null => {
  if (Array.isArray(node)) return node.map(cardProps).find(Boolean) ?? null;
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const { type, props } = node as { type: unknown; props: { children?: unknown } & Record<string, unknown> };
  return type === OrphanedClassesCard ? (props as never) : cardProps(props.children);
};

beforeEach(() => vi.clearAllMocks());

describe("users page — classes without a teacher", () => {
  it("gives the owner the list and the working teachers who could take the classes", async () => {
    serve("SUPER_ADMIN");
    const props = cardProps(await UsersPage({ searchParams: Promise.resolve({}) }));
    expect(props?.groups).toEqual([group]);
    expect(props?.teachers).toEqual([teacher]);
  });

  it("never asks for them on behalf of the front desk", async () => {
    serve("ADMIN");
    const props = cardProps(await UsersPage({ searchParams: Promise.resolve({}) }));
    expect(props).toMatchObject({ groups: [], teachers: [] });
    expect(get.mock.calls.map((call) => call[0])).not.toContain("/users/orphaned-classes");
  });

  it("still shows the users when the extra lookup fails", async () => {
    serve("SUPER_ADMIN", { orphaned: new Error("down") });
    const props = cardProps(await UsersPage({ searchParams: Promise.resolve({}) }));
    expect(props).toMatchObject({ groups: [], teachers: [] });
  });

  it.each(["TEACHER", "MARKER", "STUDENT"])("sends %s back to the dashboard", async (role) => {
    serve(role);
    await expect(UsersPage({ searchParams: Promise.resolve({}) })).rejects.toBe(redirectSignal);
  });
});
