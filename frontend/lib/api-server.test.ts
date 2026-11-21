// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-real-ip": "192.0.2.42" })) }));

describe("server API address forwarding", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });
  it("forwards the proxy address only on the internal path", async () => {
    vi.stubEnv("INTERNAL_API_URL", "http://backend:5000/api");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api-server");
    await api.get("/classes");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-forwarded-for")).toBe("192.0.2.42");
  });
  it("does not forward the proxy address to a public API", async () => {
    vi.stubEnv("INTERNAL_API_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api-server");
    await api.get("/classes");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-forwarded-for")).toBeNull();
  });
});
