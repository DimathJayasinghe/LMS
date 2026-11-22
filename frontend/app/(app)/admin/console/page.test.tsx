import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConsolePage from "./page";
import { NAV_SECTIONS, navForRole } from "@/lib/nav";

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

const asRole = (role: string) => get.mockImplementation((path: string) =>
  path === "/auth/me" ? Promise.resolve({ data: { id: "u1", role } }) : Promise.resolve({ status: "success", data: {} }));

beforeEach(() => vi.clearAllMocks());

describe("console page", () => {
  it.each(["ADMIN", "TEACHER", "MARKER", "STUDENT"])("sends %s back to the dashboard before reading any panel", async (role) => {
    asRole(role);
    await expect(ConsolePage()).rejects.toBe(redirectSignal);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(get.mock.calls.map((c) => c[0])).toEqual(["/auth/me"]);
  });

  it("opens for the owner", async () => {
    asRole("SUPER_ADMIN");
    await expect(ConsolePage()).resolves.toBeTruthy();
  });

  it("gives every panel its own Suspense boundary, so a slow or failing one never blanks the rest", async () => {
    asRole("SUPER_ADMIN");
    const names: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const { type, props } = node as { type: unknown; props: { children?: unknown } };
      if (type === Suspense) {
        const child = props.children as { type: { name: string } };
        names.push(child.type.name);
        return;
      }
      walk(props.children);
    };
    walk(await ConsolePage());
    expect(names).toEqual(["CashPanel", "OwingPanel", "MarkingPanel", "AttendancePanel", "SetupPanel", "SmsPanel"]);
  });
});

describe("console navigation", () => {
  it("is the first Administration item, for the owner only", () => {
    const admin = NAV_SECTIONS.find((s) => s.title === "Administration")!;
    expect(admin.items[0]).toMatchObject({ label: "Console", href: "/admin/console", roles: ["SUPER_ADMIN"] });
    for (const role of ["ADMIN", "TEACHER", "MARKER", "STUDENT"] as const) {
      expect(navForRole(role).flatMap((s) => s.items).some((i) => i.href === "/admin/console")).toBe(false);
    }
  });
});
