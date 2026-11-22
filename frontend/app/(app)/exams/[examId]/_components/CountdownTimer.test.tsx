import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CountdownTimer } from "./CountdownTimer";

const NOW = new Date("2026-09-06T09:00:00Z").getTime();
const at = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("CountdownTimer", () => {
  it("is a timer with an accessible name", () => {
    render(<CountdownTimer target={at(90)} />);
    expect(screen.getByRole("timer", { name: "Time remaining" })).toBeInTheDocument();
  });

  it("takes a custom name", () => {
    render(<CountdownTimer target={at(90)} label="Time until the exam opens" />);
    expect(screen.getByRole("timer", { name: "Time until the exam opens" })).toBeInTheDocument();
  });

  it("calls onExpire once when the target passes", async () => {
    const onExpire = vi.fn();
    render(<CountdownTimer target={at(3)} onExpire={onExpire} />);
    expect(onExpire).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
