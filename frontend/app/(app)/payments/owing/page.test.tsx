import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import OwingPage from "./page";

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

const COURSE = "10000000-0000-4000-8000-000000000001";
const viewer = (role: string) => ({ data: { role, organization: { timezone: "Asia/Colombo" } } });
const asRole = (role: string) => get.mockImplementation((path: string) => {
  if (path === "/auth/me") return Promise.resolve(viewer(role));
  if (path.startsWith("/payments/outstanding")) return Promise.resolve({ status: "success", data: [], count: 0, month: "2026-11" });
  return Promise.resolve({ status: "success", data: [], count: 0 });
});

beforeEach(() => { vi.clearAllMocks(); });

describe("who owes page", () => {
  it.each(["TEACHER", "MARKER", "STUDENT"])("sends %s back to the dashboard before reading the list", async (role) => {
    asRole(role);
    await expect(OwingPage({ searchParams: Promise.resolve({}) })).rejects.toBe(redirectSignal);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining("/payments/outstanding"), expect.anything());
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("lets %s read it", async (role) => {
    asRole(role);
    await expect(OwingPage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
  });

  it("passes only valid filters to the API", async () => {
    asRole("ADMIN");
    await OwingPage({ searchParams: Promise.resolve({ month: "2026-10", courseId: COURSE, page: "2" }) });
    expect(get).toHaveBeenCalledWith(`/payments/outstanding?page=2&limit=50&month=2026-10&courseId=${COURSE}`, expect.objectContaining({ cookie: "cookie" }));
    get.mockClear();
    asRole("ADMIN");
    await OwingPage({ searchParams: Promise.resolve({ month: "October", courseId: "not-a-uuid", page: "-3" }) });
    expect(get).toHaveBeenCalledWith("/payments/outstanding?page=1&limit=50", expect.objectContaining({ cookie: "cookie" }));
  });

  it("keeps the session redirect when the list answers 401", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve(viewer("ADMIN"));
      if (path.startsWith("/payments/outstanding")) return Promise.reject(new ApiError(401, "unauthorized"));
      return Promise.resolve({ status: "success", data: [], count: 0 });
    });
    await expect(OwingPage({ searchParams: Promise.resolve({}) })).rejects.toBe(redirectSignal);
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });

  it("shows an empty list rather than failing when the list errors for another reason", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve(viewer("ADMIN"));
      if (path.startsWith("/payments/outstanding")) return Promise.reject(new ApiError(500, "boom"));
      return Promise.resolve({ status: "success", data: [], count: 0 });
    });
    await expect(OwingPage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
  });
});
