// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";

const NOW_MS = Date.UTC(2026, 5, 1, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (exp: number) => `${b64url({ alg: "HS256" })}.${b64url({ exp })}.sig`;

const req = (
  path: string,
  init: { method?: string; cookie?: string; headers?: Record<string, string> } = {},
) =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.headers ?? {}),
    },
  });

const EXPIRED = `access_token=${jwt(NOW_S - 60)}`;
const VALID = `access_token=${jwt(NOW_S + 600)}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});
afterEach(() => vi.useRealTimers());

const location = (res: Response) => res.headers.get("location");
const isPassThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy", () => {
  it("sends a navigation with an expired access cookie through /auth/session with the path as next", () => {
    const res = proxy(req("/classes/7?tab=videos", { cookie: EXPIRED }));
    expect(res.status).toBe(307);
    const loc = new URL(location(res)!);
    expect(loc.pathname).toBe("/auth/session");
    expect(loc.searchParams.get("next")).toBe("/classes/7?tab=videos");
  });

  it("lets a valid access cookie through", () => {
    expect(isPassThrough(proxy(req("/dashboard", { cookie: VALID })))).toBe(true);
  });

  it("does nothing when there is no access cookie", () => {
    expect(isPassThrough(proxy(req("/dashboard")))).toBe(true);
  });

  it("does nothing for an unreadable access cookie (the backend decides)", () => {
    expect(isPassThrough(proxy(req("/dashboard", { cookie: "access_token=garbage" })))).toBe(true);
  });

  it("does not touch POST requests (Server Actions)", () => {
    expect(isPassThrough(proxy(req("/dashboard", { method: "POST", cookie: EXPIRED })))).toBe(true);
  });

  it("redirects an RSC soft-navigation GET and drops the _rsc cache-busting param from next", () => {
    const res = proxy(
      req("/classes/7?_rsc=abc12", { cookie: EXPIRED, headers: { rsc: "1" } }),
    );
    expect(res.status).toBe(307);
    expect(new URL(location(res)!).searchParams.get("next")).toBe("/classes/7");
  });

  it("keeps other query params when stripping _rsc", () => {
    const res = proxy(req("/classes/7?tab=a&_rsc=x", { cookie: EXPIRED }));
    expect(new URL(location(res)!).searchParams.get("next")).toBe("/classes/7?tab=a");
  });

  it("never redirects /auth/* pages (no loop)", () => {
    expect(isPassThrough(proxy(req("/auth/session", { cookie: EXPIRED })))).toBe(true);
    expect(isPassThrough(proxy(req("/auth/login", { cookie: EXPIRED })))).toBe(true);
  });
});

describe("proxy matcher config", () => {
  const entries = config.matcher as Array<{ source: string; missing?: Array<{ type: string; key: string; value?: string }> }>;

  it("excludes api, next internals, favicon and static files by source pattern", () => {
    const source = entries[0].source;
    for (const excluded of ["api", "_next/static", "_next/image", "favicon.ico", "auth"]) {
      expect(source).toContain(excluded);
    }
    const re = new RegExp(`^${source}$`);
    expect(re.test("/classes/7")).toBe(true);
    expect(re.test("/api/auth/me")).toBe(false);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/auth/session")).toBe(false);
    expect(re.test("/logo.png")).toBe(false);
  });

  it("skips prefetch requests via missing-header conditions", () => {
    const missing = entries[0].missing ?? [];
    const keys = missing.map((m) => `${m.type}:${m.key}`);
    expect(keys).toContain("header:next-router-prefetch");
    expect(missing.find((m) => m.key === "purpose")?.value).toBe("prefetch");
  });
});
