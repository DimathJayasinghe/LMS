import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SERVER_CLOCK_REFRESH_MS, useServerOffset } from "./use-server-offset";

const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: m.get } }));

const serverAhead = (ms: number) => m.get.mockResolvedValue({ data: { timestamp: new Date(Date.now() + ms).toISOString() } });
const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers();
  m.get.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useServerOffset", () => {
  it("starts at zero, the device clock", () => {
    m.get.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useServerOffset());
    expect(result.current).toBe(0);
  });

  it("takes the offset from GET /health", async () => {
    serverAhead(30_000);
    const { result } = renderHook(() => useServerOffset());
    await flush();
    expect(m.get).toHaveBeenCalledWith("/health");
    expect(result.current).toBe(30_000);
  });

  it("measures again every five minutes", async () => {
    serverAhead(1000);
    renderHook(() => useServerOffset());
    await flush();
    expect(m.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(SERVER_CLOCK_REFRESH_MS); });
    expect(m.get).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good offset when a later measurement fails", async () => {
    serverAhead(8000);
    const { result } = renderHook(() => useServerOffset());
    await flush();
    m.get.mockRejectedValue(new Error("offline"));
    await act(async () => { await vi.advanceTimersByTimeAsync(SERVER_CLOCK_REFRESH_MS); });
    expect(result.current).toBe(8000);
  });

  it("falls back to the device clock when the server is never reachable", async () => {
    m.get.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useServerOffset());
    await flush();
    expect(result.current).toBe(0);
  });

  it("stops measuring when it unmounts", async () => {
    serverAhead(0);
    const { unmount } = renderHook(() => useServerOffset());
    await flush();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(SERVER_CLOCK_REFRESH_MS * 3); });
    expect(m.get).toHaveBeenCalledTimes(1);
  });
});
