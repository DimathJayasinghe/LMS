import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import CashPage from "./page";

const { get, redirectSignal, redirect } = vi.hoisted(() => {
  const redirectSignal = new Error("redirected");
  return { get: vi.fn(), redirectSignal, redirect: vi.fn(() => { throw redirectSignal; }) };
});
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ toString: () => "cookie" }) }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => { if (error === redirectSignal) throw error; },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: { get } };
});

const INSTITUTE = "20000000-0000-4000-8000-000000000001";
const list = { status: "success", data: [], count: 0, from: "2026-11-14", to: "2026-11-20", tallyEnabled: true };
const asRole = (role: string) => get.mockImplementation((path: string) => {
  if (path === "/auth/me") return Promise.resolve({ data: { id: "u1", role, organization: { timezone: "Asia/Colombo" } } });
  if (path.startsWith("/payments/cash")) return Promise.resolve(list);
  return Promise.resolve({ status: "success", data: [], count: 0 });
});
const cashPath = () => get.mock.calls.map((c) => c[0] as string).find((p) => p.startsWith("/payments/cash"));

beforeEach(() => vi.clearAllMocks());

describe("cash page", () => {
  it.each(["TEACHER", "MARKER", "STUDENT"])("sends %s back to the dashboard before reading any cash", async (role) => {
    asRole(role);
    await expect(CashPage({ searchParams: Promise.resolve({}) })).rejects.toBe(redirectSignal);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
    expect(cashPath()).toBeUndefined();
  });

  it.each(["ADMIN", "SUPER_ADMIN"])("lets %s read it", async (role) => {
    asRole(role);
    await expect(CashPage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
  });

  it("asks for the cash with the cookie and the valid filters only", async () => {
    asRole("SUPER_ADMIN");
    await CashPage({ searchParams: Promise.resolve({ from: "2026-11-01", to: "not-a-day", instituteId: INSTITUTE }) });
    expect(get).toHaveBeenCalledWith(`/payments/cash?from=2026-11-01&instituteId=${INSTITUTE}`, expect.objectContaining({ cookie: "cookie" }));
  });

  it("ignores a branch that is not an id", async () => {
    asRole("ADMIN");
    await CashPage({ searchParams: Promise.resolve({ instituteId: "kandy; drop" }) });
    expect(cashPath()).toBe("/payments/cash");
  });

  it("gives the owner the review queue and front desk the plain list", async () => {
    asRole("SUPER_ADMIN");
    await CashPage({ searchParams: Promise.resolve({ review: "1" }) });
    expect(cashPath()).toBe("/payments/cash-tally?unreconciled=true");
    vi.clearAllMocks();
    asRole("ADMIN");
    await CashPage({ searchParams: Promise.resolve({ review: "1" }) });
    expect(cashPath()).toBe("/payments/cash");
  });

  it("still shows the page when the list cannot be read", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/auth/me") return Promise.resolve({ data: { id: "u1", role: "ADMIN", organization: { timezone: "Asia/Colombo" } } });
      return Promise.reject(new ApiError(500, "boom", "INTERNAL"));
    });
    await expect(CashPage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
  });
});
