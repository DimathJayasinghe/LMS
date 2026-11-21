import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import ClassesPage from "./page";

const { get, redirect } = vi.hoisted(() => ({ get: vi.fn(), redirect: vi.fn(() => { throw new Error("redirected"); }) }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ toString: () => "cookie" }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { get } };
});

describe("classes session", () => {
  it("redirects when a parallel data request returns 401 before the user request", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/auth/me") return new Promise(() => {});
      if (path === "/classes") return Promise.reject(new ApiError(401, "unauthorized"));
      return Promise.resolve({ data: [] });
    });
    await expect(ClassesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirected");
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });
});
