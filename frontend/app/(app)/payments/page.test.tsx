import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import PaymentsPage from "./page";

const { get, redirectSignal, redirect } = vi.hoisted(() => {
  const redirectSignal = new Error("redirected");
  return { get: vi.fn(), redirectSignal, redirect: vi.fn(() => { throw redirectSignal; }) };
});
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ toString: () => "cookie" }) }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => { if (error === redirectSignal) throw error; },
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { get } };
});

describe("payments session", () => {
  it("preserves redirects through optional data fallbacks", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve({ data: { role: "STUDENT" } });
      if (path === "/enrollments/my") return Promise.reject(new ApiError(401, "unauthorized"));
      return Promise.resolve({ data: [] });
    });
    await expect(PaymentsPage({ searchParams: Promise.resolve({}) })).rejects.toBe(redirectSignal);
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });
});
