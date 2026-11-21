import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import type { CashSummary } from "@/lib/cash";

/** One line above the collect form: the cash this user has taken today and whether it is counted. */
export function TodaysCash({ summary }: { summary: CashSummary }) {
  if (summary.payments === 0) {
    return <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground print:hidden">No cash taken yet today.</p>;
  }
  const counted = summary.uncounted === 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm print:hidden">
      <span className="text-muted-foreground">Your cash today</span>
      <span className="font-semibold tabular-nums text-foreground">{formatCurrency(summary.amount)}</span>
      <span className="text-muted-foreground">from {summary.payments} payment{summary.payments === 1 ? "" : "s"}</span>
      {counted && <span className="text-muted-foreground">Counted</span>}
      <Link href="/payments/cash" className="ml-auto font-medium text-foreground underline-offset-2 hover:underline">
        {counted ? "See cash" : "Count the day"}
      </Link>
    </div>
  );
}
