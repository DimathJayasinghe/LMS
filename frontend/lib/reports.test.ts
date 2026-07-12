import { describe, it, expect } from "vitest";
import { formatLkr, compactLkr, shortMonth, monthLabel, pct, METHOD_ORDER, METHOD_OPACITY } from "./reports";

describe("formatLkr", () => {
  it("renders whole rupees with thousands separators", () => {
    expect(formatLkr("39500.00")).toBe("Rs 39,500");
    expect(formatLkr(0)).toBe("Rs 0");
    expect(formatLkr("1234567.89")).toBe("Rs 1,234,568");
  });

  it("is defensive against non-numeric input", () => {
    expect(formatLkr("")).toBe("Rs 0");
    expect(formatLkr("abc")).toBe("Rs 0");
  });
});

describe("compactLkr", () => {
  it("abbreviates thousands and millions", () => {
    expect(compactLkr(39500)).toBe("40k");
    expect(compactLkr(1_200_000)).toBe("1.2M");
    expect(compactLkr(500)).toBe("500");
    expect(compactLkr(0)).toBe("0");
  });
});

describe("shortMonth / monthLabel", () => {
  it("maps YYYY-MM to labels", () => {
    expect(shortMonth("2026-07")).toBe("Jul");
    expect(shortMonth("2025-01")).toBe("Jan");
    expect(monthLabel("2026-07")).toBe("July 2026");
    expect(monthLabel("2025-12")).toBe("December 2025");
  });
});

describe("pct", () => {
  it("returns whole-number percentages", () => {
    expect(pct(4000, 16000)).toBe(25);
    expect(pct(1, 3)).toBe(33);
  });

  it("returns 0 when the total is 0 (no divide-by-zero)", () => {
    expect(pct(0, 0)).toBe(0);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("method identity", () => {
  it("has a stable shade per method regardless of rank", () => {
    // Every method in the fixed order has an assigned opacity, and the
    // shades are strictly decreasing so slices stay distinguishable.
    const shades = METHOD_ORDER.map((m) => METHOD_OPACITY[m]);
    expect(shades).toEqual([1, 0.68, 0.42, 0.24]);
    for (let i = 1; i < shades.length; i++) {
      expect(shades[i]).toBeLessThan(shades[i - 1]!);
    }
  });
});
