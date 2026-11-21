import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import AccountSetupPage from "./page";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ toString: () => "cookie" }), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirected"); }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { get } };
});
vi.mock("./_components/AccountSetupForm", () => ({ AccountSetupForm: () => null }));

describe("account setup session", () => {
  beforeEach(() => { get.mockReset(); });
  it("redirects an expired session", async () => {
    get.mockRejectedValue(new ApiError(401, "unauthorized"));
    await expect(AccountSetupPage()).rejects.toThrow("redirected");
  });
  it.each([429, 502])("propagates status %i", async (status) => {
    const error = new ApiError(status, "failed");
    get.mockRejectedValue(error);
    await expect(AccountSetupPage()).rejects.toBe(error);
  });
  it("propagates network failures", async () => {
    const error = new Error("offline");
    get.mockRejectedValue(error);
    await expect(AccountSetupPage()).rejects.toBe(error);
  });
});
