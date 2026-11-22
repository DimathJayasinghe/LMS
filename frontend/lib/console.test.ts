import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { loadPanel, METHOD_LABELS } from "./console";

const { get, redirect, redirectSignal } = vi.hoisted(() => {
  const redirectSignal = new Error("NEXT_REDIRECT");
  return { get: vi.fn(), redirectSignal, redirect: vi.fn(() => { throw redirectSignal; }) };
});
vi.mock("@/lib/api-server", () => ({ api: { get } }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => { if (error === redirectSignal) throw error; },
}));

beforeEach(() => vi.clearAllMocks());

describe("loadPanel", () => {
  it("reads the path with the cookie and returns the data", async () => {
    get.mockResolvedValue({ status: "success", data: { students: 3 } });
    await expect(loadPanel("/console/owing", "cookie")).resolves.toEqual({ ok: true, data: { students: 3 } });
    expect(get).toHaveBeenCalledWith("/console/owing", expect.objectContaining({ cookie: "cookie" }));
  });

  it("turns any failure into a failed panel instead of throwing", async () => {
    get.mockRejectedValue(new ApiError(500, "boom"));
    await expect(loadPanel("/console/cash", "cookie")).resolves.toEqual({ ok: false });
    get.mockRejectedValue(new Error("network"));
    await expect(loadPanel("/console/cash", "cookie")).resolves.toEqual({ ok: false });
  });

  it("sends a lost session to the login page rather than hiding it in one panel", async () => {
    get.mockRejectedValue(new ApiError(401, "expired"));
    await expect(loadPanel("/console/cash", "cookie")).rejects.toBe(redirectSignal);
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });
});

describe("METHOD_LABELS", () => {
  it("names every payment method", () => {
    expect(Object.keys(METHOD_LABELS).sort()).toEqual(["BULK", "ENTRANCE", "MANUAL", "ONLINE"]);
  });
});
