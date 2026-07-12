/**
 * Pure presentation helpers for the super-admin financial report
 * (`/admin/reports`). No React, no fetching — all deterministic and
 * unit-tested in `reports.test.ts` so the chart components can stay thin.
 */
import type { PaymentMethod } from "./types";

/** Rupee amounts arrive as decimal strings ("39500.00"). Show whole rupees. */
export function formatLkr(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  const safe = Number.isFinite(n) ? Math.round(n) : 0;
  return `Rs ${safe.toLocaleString("en-LK")}`;
}

/** Compact money for axis ticks: 39500 → "40k", 1200000 → "1.2M", 0 → "0". */
export function compactLkr(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

/** Compact axis label: "2026-07" → "Jul". */
export function shortMonth(ym: string): string {
  const m = Number(ym.split("-")[1]);
  return MONTHS_SHORT[m - 1] ?? ym;
}

/** Human header: "2026-07" → "July 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const name = MONTHS_LONG[(m ?? 0) - 1];
  return name ? `${name} ${y}` : ym;
}

/** Whole-number percent of a total; 0 when the total is 0. */
export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Fixed display order for payment methods. Identity — and therefore a
 * method's slice shade — follows this order, never the data's rank, so a
 * filtered-out method never repaints the survivors (dataviz non-negotiable).
 */
export const METHOD_ORDER: PaymentMethod[] = ["ONLINE", "ENTRANCE", "BULK", "MANUAL"];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  ONLINE: "Online",
  ENTRANCE: "Entrance",
  BULK: "Bulk",
  MANUAL: "Manual",
};

/**
 * Lightness-encoded shade per method, applied as `fillOpacity` over the
 * theme's `--foreground`. Keyed by identity (not index) so the donut reads
 * the same in light and dark mode and stays stable under filtering.
 */
export const METHOD_OPACITY: Record<PaymentMethod, number> = {
  ONLINE: 1,
  ENTRANCE: 0.68,
  BULK: 0.42,
  MANUAL: 0.24,
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
