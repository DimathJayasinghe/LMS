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
    const replays: string[] = [];
    installFetch(async (url) => {
      if (url.endsWith("/auth/refresh")) {
        await new Promise((r) => setTimeout(r, 10));
        refreshed = true;
        return json(200, OK);
      }
      if (refreshed) replays.push(url);
      return refreshed ? json(200, OK) : json(401, EXPIRED);
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => api.get(`/things/${i}`)),
    );

    expect(results).toHaveLength(10);
    expect(refreshCalls()).toHaveLength(1);
    // Exactly the ten original calls, replayed once each after the refresh.
    expect(replays).toHaveLength(10);
    expect(new Set(replays).size).toBe(10);
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
      expect(err.expired).toBe(true);
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

  it("runs the refresh request only while holding the lock, so a second tab waits its turn", async () => {
    // A real FIFO lock: a second holder cannot start until the first releases.
    let tail: Promise<unknown> = Promise.resolve();
    let held = false;
    const overlaps: boolean[] = [];
    const request = vi.fn((_name: string, cb: () => Promise<unknown>) => {
      const run = tail.then(async () => {
        held = true;
        try {
          return await cb();
        } finally {
          held = false;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    });
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    installFetch(async (url) => {
      if (url.endsWith("/auth/refresh")) {
        overlaps.push(held);
        await new Promise((r) => setTimeout(r, 5));
      }
      return json(200, OK);
    });

    await refreshSession();
    await refreshSession();

    expect(request.mock.calls.map((c) => c[0])).toEqual(["lms-auth-refresh", "lms-auth-refresh"]);
    // Every refresh fetch happened inside the lock callback.
    expect(overlaps).toEqual([true, true]);
  });

  it("does not hang when acquiring the lock itself fails", async () => {
    const request = vi.fn(async () => {
      throw new Error("lock unavailable");
    });
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    installFetch(async () => json(200, OK));

    await expect(refreshSession()).resolves.toEqual({ ok: false, status: null });
  });

  it("gives up on a stalled refresh request instead of holding the lock forever", async () => {
    vi.useFakeTimers();
    try {
      // A connection that never answers; only the abort signal can end it.
      fetchMock.mockImplementation((url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? "GET" });
        return new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "TimeoutError")));
        });
      });

      const pending = refreshSession();
      await vi.advanceTimersByTimeAsync(11_000);
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(11_000);
      await expect(pending).resolves.toEqual({ ok: false, status: null });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("refreshSession result", () => {
  it("reports ok on success", async () => {
    installFetch(async () => json(200, OK));
    await expect(refreshSession()).resolves.toEqual({ ok: true });
  });

  it.each([401, 403, 429])("reports the http status %s on failure", async (status) => {
    installFetch(async () => json(status, { status: "error", message: "x" }));
    await expect(refreshSession()).resolves.toEqual({ ok: false, status });
  });

  it("reports a 5xx after one quick retry", async () => {
    vi.useFakeTimers();
    try {
      installFetch(async () => json(502, { status: "error", message: "x" }));
      const pending = refreshSession();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toEqual({ ok: false, status: 502 });
      expect(refreshCalls()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports status null on a network error after one quick retry", async () => {
    vi.useFakeTimers();
    try {
      installFetch(async () => {
        throw new TypeError("network down");
      });
      const pending = refreshSession();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toEqual({ ok: false, status: null });
      expect(refreshCalls()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries once quickly after a lost response, inside the server's tolerance window", async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      installFetch(async (url) => {
        if (!url.endsWith("/auth/refresh")) return json(200, OK);
        n += 1;
        if (n === 1) throw new TypeError("response lost");
        return json(200, OK);
      });
      const pending = refreshSession();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(pending).resolves.toEqual({ ok: true });
      expect(n).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([401, 403, 429])("does not retry a definitive or rate-limited %s", async (status) => {
    installFetch(async () => json(status, { status: "error", message: "x" }));
    await refreshSession();
    expect(refreshCalls()).toHaveLength(1);
  });
});
