import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoSubmit } from "./useAutoSubmit";

const NOW = new Date("2026-09-06T09:00:00Z").getTime();
const endIn = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();
const tick = (seconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(seconds * 1000); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const setup = (over: Partial<Parameters<typeof useAutoSubmit>[0]> = {}, onFire = vi.fn()) => {
  const props = { endTime: endIn(60), leadSeconds: 15, offsetMs: 0, active: true, onFire, ...over };
  const hook = renderHook((p: typeof props) => useAutoSubmit(p), { initialProps: props });
  return { onFire, props, ...hook };
};

describe("useAutoSubmit", () => {
  it("fires once, the lead time before the end", async () => {
    const { onFire } = setup();
    await tick(44);
    expect(onFire).not.toHaveBeenCalled();
    await tick(2);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("does not fire again afterwards", async () => {
    const { onFire } = setup();
    await tick(120);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("fires earlier by the offset when the device clock is behind the server", async () => {
    const { onFire } = setup({ offsetMs: 30_000 }); // server time = device time + 30 s
    await tick(14);
    expect(onFire).not.toHaveBeenCalled();
    await tick(2);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("fires later by the offset when the device clock runs ahead of the server", async () => {
    const { onFire } = setup({ offsetMs: -30_000 }); // device is 30 s fast
    await tick(74);
    expect(onFire).not.toHaveBeenCalled();
    await tick(2);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("follows an offset that arrives after the first measurement", async () => {
    const { onFire, rerender, props } = setup();
    await tick(10);
    rerender({ ...props, offsetMs: 40_000 }); // now 40 s ahead: the fire time (45 s) has passed
    await tick(1);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("waits while inactive and fires on activation if the time has already passed", async () => {
    const { onFire, rerender, props } = setup({ active: false });
    await tick(120);
    expect(onFire).not.toHaveBeenCalled();
    rerender({ ...props, active: true });
    await tick(1);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("fires at once when the page is opened inside the lead window", async () => {
    const { onFire } = setup({ endTime: endIn(5) });
    await tick(1);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, props } = setup({}, first);
    rerender({ ...props, onFire: second });
    await tick(50);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops when it unmounts", async () => {
    const { onFire, unmount } = setup();
    unmount();
    await tick(120);
    expect(onFire).not.toHaveBeenCalled();
  });

  it("asks again each second while the callback says there was nothing to send, then stops once it sends", async () => {
    const onFire = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    setup({}, onFire);
    await tick(44);
    expect(onFire).not.toHaveBeenCalled();
    await tick(1); // fire time reached: not handled
    await tick(1); // not handled
    await tick(1); // handled
    await tick(30);
    expect(onFire).toHaveBeenCalledTimes(3);
  });

  it("treats a callback that returns nothing as handled", async () => {
    const { onFire } = setup();
    await tick(120);
    expect(onFire).toHaveBeenCalledTimes(1);
  });
});
