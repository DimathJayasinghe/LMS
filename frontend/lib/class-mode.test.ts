import { describe, expect, it } from "vitest";
import { canGoLive, classModeLabel } from "./class-mode";

describe("class mode", () => {
  it("names the three modes, treating a missing mode as in hall plus live stream", () => {
    expect(classModeLabel("PHYSICAL")).toBe("In hall");
    expect(classModeLabel("ONLINE")).toBe("Online only");
    expect(classModeLabel(null)).toBe("In hall + live stream");
  });
  it("offers a live class for every mode except hall only", () => {
    expect(canGoLive("ONLINE")).toBe(true);
    expect(canGoLive(null)).toBe(true);
    expect(canGoLive("PHYSICAL")).toBe(false);
  });
});
