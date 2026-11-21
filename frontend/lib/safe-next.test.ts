import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each([
    ["/classes/1", "/classes/1"],
    ["/classes/1?tab=videos", "/classes/1?tab=videos"],
    ["/dashboard#top", "/dashboard#top"],
    ["/", "/"],
  ])("keeps the relative path %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/x"],
    ["backslash host", "/\\evil.com"],
    ["double backslash", "\\\\evil.com"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com/dashboard"],
    ["javascript scheme", "javascript:alert(1)"],
    ["no leading slash", "classes/1"],
    ["encoded double slash", "/%2F%2Fevil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["control character", "/a\nb"],
    ["tab inside", "/\t/evil.com"],
    ["empty", ""],
    ["null", null],
    ["undefined", undefined],
    ["array", ["/a", "/b"]],
  ])("falls back to /dashboard for %s", (_n, input) => {
    expect(safeNext(input as string | null | undefined)).toBe("/dashboard");
  });

  it("falls back to the supplied default", () => {
    expect(safeNext("//evil.com", "/home")).toBe("/home");
  });

  it("does not send a user back to the session, login or signup pages", () => {
    expect(safeNext("/auth/session?next=/x")).toBe("/dashboard");
    expect(safeNext("/auth/login")).toBe("/dashboard");
    expect(safeNext("/auth/signup")).toBe("/dashboard");
  });

  it("allows returning to the account setup page", () => {
    expect(safeNext("/auth/account-setup")).toBe("/auth/account-setup");
  });
});
