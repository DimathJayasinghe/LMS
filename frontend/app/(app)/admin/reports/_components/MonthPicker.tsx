"use client";

import { useRouter } from "next/navigation";

/**
 * Month selector for the report. Pushes `?month=YYYY-MM` so the page
 * re-fetches server-side; the current month clears the query entirely.
 */
export function MonthPicker({ month, current }: { month: string; current: string }) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Month
      <input
        type="month"
        value={month}
        max={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v && v !== current ? `/admin/reports?month=${v}` : "/admin/reports");
        }}
        aria-label="Report month"
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
