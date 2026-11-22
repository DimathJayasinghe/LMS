import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStudentLookup } from "./student-lookup";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));

const nimal = { id: "u1", name: "Nimal Perera", indexNumber: 42, profileImage: null };

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset().mockResolvedValue({ data: [nimal], count: 1 });
});
afterEach(() => vi.useRealTimers());

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(300); });

describe("useStudentLookup", () => {
  it("asks nothing for fewer than two characters", async () => {
    const { result } = renderHook(() => useStudentLookup(" n "));
    await settle();
    expect(get).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it("waits for a pause, trims, encodes, and returns the matches", async () => {
    const { result } = renderHook(() => useStudentLookup(" ni mal "));
    expect(get).not.toHaveBeenCalled();
    await settle();
    expect(get).toHaveBeenCalledWith("/users/lookup?q=ni%20mal");
    expect(result.current).toEqual([nimal]);
  });

  it("asks once for text typed quickly", async () => {
    const { rerender } = renderHook(({ term }) => useStudentLookup(term), { initialProps: { term: "ni" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    rerender({ term: "nim" });
    await settle();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/users/lookup?q=nim");
  });

  it("shows no matches under text they were not found for", async () => {
    const { result, rerender } = renderHook(({ term }) => useStudentLookup(term), { initialProps: { term: "nim" } });
    await settle();
    expect(result.current).toEqual([nimal]);
    rerender({ term: "nima" });
    expect(result.current).toEqual([]);
    rerender({ term: "" });
    expect(result.current).toEqual([]);
  });

  it("reads a failed lookup as no matches", async () => {
    get.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useStudentLookup("nim"));
    await settle();
    expect(result.current).toEqual([]);
  });
});
