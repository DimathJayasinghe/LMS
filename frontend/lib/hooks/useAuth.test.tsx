import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./useAuth";

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get: m.get, post: m.post } };
});

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  m.get.mockReset().mockResolvedValue({ data: { id: "u1", role: "STUDENT" } });
  m.post.mockReset().mockResolvedValue({});
  localStorage.clear();
});

describe("logout", () => {
  it("clears the exam drafts this device holds, so the next person on it never sees them", async () => {
    localStorage.setItem("exam:u1:e1:written", "draft");
    localStorage.setItem("exam:u1:e1:answers", "ticks");
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.logout(); });
    expect(localStorage.getItem("exam:u1:e1:written")).toBeNull();
    expect(localStorage.getItem("exam:u1:e1:answers")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("light");
    expect(result.current.user).toBeNull();
  });

  it("clears them even when the server call fails", async () => {
    localStorage.setItem("exam:u1:e1:written", "draft");
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    m.post.mockRejectedValue(new Error("offline"));
    await act(async () => { await result.current.logout().catch(() => undefined); });
    expect(localStorage.getItem("exam:u1:e1:written")).toBeNull();
  });
});
