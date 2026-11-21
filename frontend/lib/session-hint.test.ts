import { describe, expect, it } from "vitest";
import { isAccessTokenExpired } from "./session-hint";

const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");
const token = (payload: unknown) => `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig`;

const NOW = 1_800_000_000;

describe("isAccessTokenExpired", () => {
  it("is false for a token that expires in the future", () => {
    expect(isAccessTokenExpired(token({ exp: NOW + 600 }), NOW)).toBe(false);
  });

  it("is true for a token whose exp has passed", () => {
    expect(isAccessTokenExpired(token({ exp: NOW - 600 }), NOW)).toBe(true);
  });

  it("is false one second before exp and true at exp", () => {
    expect(isAccessTokenExpired(token({ exp: NOW }), NOW - 1)).toBe(false);
    expect(isAccessTokenExpired(token({ exp: NOW }), NOW)).toBe(true);
    expect(isAccessTokenExpired(token({ exp: NOW }), NOW + 1)).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["not a jwt", "garbage"],
    ["two segments", "a.b"],
    ["payload not base64 json", "a.!!!.c"],
    ["payload not an object", `a.${b64url("str")}.c`],
    ["missing exp", token({ userId: "u" })],
    ["exp not a number", token({ exp: "soon" })],
  ])("treats %s as not expired (hint only, the backend decides)", (_n, value) => {
    expect(isAccessTokenExpired(value as string | undefined, NOW)).toBe(false);
  });
});
