import { describe, expect, it, vi } from "vitest";
import { measureServerOffset } from "./server-clock";

const clock = (...ticks: number[]) => {
  const queue = [...ticks];
  return () => queue.shift() ?? 0;
};

describe("measureServerOffset", () => {
  it("is the server time minus the device time at the middle of the round trip", async () => {
    // asked at 1000, answered at 1200 (middle 1100); the server said 5100
    const offset = await measureServerOffset(() => Promise.resolve(new Date(5100).toISOString()), clock(1000, 1200));
    expect(offset).toBe(4000);
  });

  it("is negative when the device clock runs ahead of the server", async () => {
    const offset = await measureServerOffset(() => Promise.resolve(new Date(70_000).toISOString()), clock(100_000, 100_000));
    expect(offset).toBe(-30_000);
  });

  it("is zero when the clocks agree", async () => {
    const offset = await measureServerOffset(() => Promise.resolve(new Date(2000).toISOString()), clock(1900, 2100));
    expect(offset).toBe(0);
  });

  it("gives null when the server cannot be reached", async () => {
    await expect(measureServerOffset(() => Promise.reject(new Error("offline")), clock(1, 2))).resolves.toBeNull();
  });

  it.each(["not a date", "", undefined])("gives null for an unusable timestamp %j", async (bad) => {
    await expect(measureServerOffset(() => Promise.resolve(bad as string), clock(1, 2))).resolves.toBeNull();
  });

  it("asks once", async () => {
    const get = vi.fn().mockResolvedValue(new Date(0).toISOString());
    await measureServerOffset(get, clock(0, 0));
    expect(get).toHaveBeenCalledTimes(1);
  });
});
