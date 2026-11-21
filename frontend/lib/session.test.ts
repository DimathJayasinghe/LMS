import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";
import { requireUser } from "./session";

vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirected"); }) }));
vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, api: { get: vi.fn() } };
});

describe("requireUser", () => {
  beforeEach(() => vi.resetAllMocks());
  it("returns the current user", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { id: "user" } });
    expect(await requireUser("cookie")).toEqual({ id: "user" });
  });
  it("redirects on 401", async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(401, "unauthorized"));
    await expect(requireUser("cookie")).rejects.toThrow("redirected");
  });
  it.each([403, 429, 502])("propagates status %i", async (status) => {
    const error = new ApiError(status, "failed");
    vi.mocked(api.get).mockRejectedValue(error);
    await expect(requireUser("cookie")).rejects.toBe(error);
  });
  it("propagates network failures", async () => {
    const error = new Error("offline");
    vi.mocked(api.get).mockRejectedValue(error);
    await expect(requireUser("cookie")).rejects.toBe(error);
  });
});
