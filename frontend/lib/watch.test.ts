import { describe, it, expect } from "vitest";
import { accumulateWatch, initWatch, WATCH_THRESHOLD_SECONDS } from "./watch";

describe("accumulateWatch", () => {
  it("accumulates small forward steps", () => {
    let s = initWatch();
    s = accumulateWatch(s, 1).state;
    const r = accumulateWatch(s, 2);
    expect(r.state.watched).toBeCloseTo(2);
    expect(r.reached).toBe(false);
  });

  it("ignores large forward jumps (seeking ahead)", () => {
    const r = accumulateWatch(initWatch(), 100);
    expect(r.state.watched).toBe(0);
    expect(r.state.lastSeconds).toBe(100);
  });

  it("ignores backward steps (rewind)", () => {
    const r = accumulateWatch({ watched: 5, lastSeconds: 10 }, 3);
    expect(r.state.watched).toBe(5);
  });

  it("reports reached exactly once when crossing the threshold", () => {
    let s = initWatch();
    let reached = 0;
    for (let t = 1; t <= 40; t++) {
      const r = accumulateWatch(s, t);
      s = r.state;
      if (r.reached) reached += 1;
    }
    expect(s.watched).toBeGreaterThanOrEqual(WATCH_THRESHOLD_SECONDS);
    expect(reached).toBe(1);
  });

  it("cannot be gamed by scrubbing straight to the end", () => {
    // one giant jump to 3600s should not count as watched
    const r = accumulateWatch(initWatch(), 3600);
    expect(r.reached).toBe(false);
    expect(r.state.watched).toBe(0);
  });
});
