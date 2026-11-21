import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, refreshSession } from "./api";

type Call = { url: string; method: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const EXPIRED = { status: "error", message: "expired", data: { expired: true } };
const OK = { status: "success", data: { ok: true } };

let calls: Call[];
const fetchMock = vi.fn();

function installFetch(handler: (url: string, method: string) => Promise<Response> | Response) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    return handler(url, method);
  });
}
const refreshCalls = () => calls.filter((c) => c.url.endsWith("/auth/refresh"));

beforeEach(() => {
  calls = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
});

describe("api single-flight refresh", () => {
  it("ten parallel expired calls cause exactly one refresh and ten replays", async () => {
    let refreshed = false;
    installFetch(async (url) => {
      if (url.endsWith("/auth/refresh")) {
        await new Promise((r) => setTimeout(r, 10));
        refreshed = true;
        return json(200, OK);
      }
      return refreshed ? json(200, OK) : json(401, EXPIRED);
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => api.get(`/things/${i}`)),
    );

    expect(results).toHaveLength(10);
    expect(refreshCalls()).toHaveLength(1);
    const replays = calls.filter((c) => c.url.includes("/things/") && refreshed);
    expect(replays.length).toBeGreaterThanOrEqual(10);
  });

  it("a failed refresh rejects every waiting caller with the original expired error", async () => {
    installFetch(async (url) =>
      url.endsWith("/auth/refresh") ? json(401, { status: "error", message: "no" }) : json(401, EXPIRED),
    );

    const settled = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => api.get(`/things/${i}`)),
    );

    expect(settled.every((s) => s.status === "rejected")).toBe(true);
    for (const s of settled) {
      const err = (s as PromiseRejectedResult).reason as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(401);
    }
    expect(refreshCalls()).toHaveLength(1);
  });

  it("allows a later refresh once the first has settled", async () => {
    installFetch(async (url) => (url.endsWith("/auth/refresh") ? json(200, OK) : json(200, OK)));
    await refreshSession();
    await refreshSession();
    expect(refreshCalls()).toHaveLength(2);
  });

  it("does not retry a call that is not an expired-token 401", async () => {
    installFetch(async () => json(401, { status: "error", message: "bad creds", data: null }));
    await expect(api.get("/x")).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls()).toHaveLength(0);
  });

  it("serialises refreshes across tabs through navigator.locks", async () => {
    const request = vi.fn(async (_name: string, cb: () => Promise<unknown>) => cb());
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    installFetch(async () => json(200, OK));

    await refreshSession();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("lms-auth-refresh");
    expect(refreshCalls()).toHaveLength(1);
  });
});

describe("refreshSession result", () => {
  it("reports ok on success", async () => {
    installFetch(async () => json(200, OK));
    await expect(refreshSession()).resolves.toEqual({ ok: true });
  });

  it.each([401, 403, 429, 502])("reports the http status %s on failure", async (status) => {
    installFetch(async () => json(status, { status: "error", message: "x" }));
    await expect(refreshSession()).resolves.toEqual({ ok: false, status });
  });

  it("reports status null on a network error", async () => {
    installFetch(async () => {
      throw new TypeError("network down");
    });
    await expect(refreshSession()).resolves.toEqual({ ok: false, status: null });
  });
});
