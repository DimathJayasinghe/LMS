import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import PaymentsPage from "./page";

const { get, redirectSignal, redirect } = vi.hoisted(() => {
  const redirectSignal = new Error("redirected");
  return { get: vi.fn(), redirectSignal, redirect: vi.fn(() => { throw redirectSignal; }) };
});
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ toString: () => "cookie" }) }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => { if (error === redirectSignal) throw error; },
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { get } };
});

describe("payments session", () => {
  it("preserves redirects through optional data fallbacks", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve({ data: { role: "STUDENT" } });
      if (path === "/enrollments/my") return Promise.reject(new ApiError(401, "unauthorized"));
      return Promise.resolve({ data: [] });
    });
    await expect(PaymentsPage({ searchParams: Promise.resolve({}) })).rejects.toBe(redirectSignal);
    expect(redirect).toHaveBeenCalledWith("/auth/login");
  });
});

describe("payments admin view", () => {
  const cashList = (over: Record<string, unknown> = {}) => ({ status: "success", data: [], count: 0, from: "", to: "", tallyEnabled: true, ...over });
  const asAdmin = (cash: () => Promise<unknown>) => get.mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve({ data: { id: "clerk", role: "ADMIN", organization: { timezone: "Asia/Colombo" } } });
    if (path.startsWith("/payments/cash")) return cash();
    if (path === "/institutes") return Promise.resolve({ status: "success", data: [{ id: "i1", name: "Kandy" }], count: 1 });
    return Promise.resolve({ status: "success", data: [], count: 0 });
  });
  const adminProps = async () => {
    const page = await PaymentsPage({ searchParams: Promise.resolve({}) }) as { props: { children: { props: Record<string, unknown> }[] } };
    return page.props.children[1]!.props;
  };

  it("reads only the viewer's own cash for today", async () => {
    vi.setSystemTime(new Date("2026-11-20T18:40:00Z"));
    asAdmin(() => Promise.resolve(cashList({ data: [{ amount: "2500.00", paymentCount: 1, tally: null }] })));
    const props = await adminProps();
    expect(get).toHaveBeenCalledWith("/payments/cash?from=2026-11-21&to=2026-11-21&collectorId=clerk", expect.objectContaining({ cookie: "cookie" }));
    expect(props.todaysCash).toEqual({ amount: 2500, payments: 1, needCount: 1 });
    vi.useRealTimers();
  });

  it("passes the branches to the collect form", async () => {
    asAdmin(() => Promise.resolve(cashList()));
    expect((await adminProps()).institutes).toEqual([{ id: "i1", name: "Kandy" }]);
  });

  it("hides the strip when the owner turned the count off", async () => {
    asAdmin(() => Promise.resolve(cashList({ tallyEnabled: false })));
    expect((await adminProps()).todaysCash).toBeNull();
  });

  it("still shows the page, without the strip, when the cash cannot be read", async () => {
    asAdmin(() => Promise.reject(new ApiError(500, "boom", "INTERNAL")));
    expect((await adminProps()).todaysCash).toBeNull();
  });
});
