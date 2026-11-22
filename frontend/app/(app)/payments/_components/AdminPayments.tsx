"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { BulkUpload } from "./BulkUpload";
import { CollectPayment } from "./CollectPayment";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { PaymentOverrideForm } from "./PaymentOverrideForm";
import { PaymentAdjustmentPanel } from "./PaymentAdjustmentPanel";
import { TodaysCash } from "./TodaysCash";
import type { CashSummary } from "@/lib/cash";
import type { Payment, PaymentStatus, PaymentSummary } from "@/lib/types";

interface Props {
  payments: Payment[];
  total: number;
  pageSize: number;
  page: number;
  month: string;
  status: PaymentStatus | "all";
  statuses: PaymentStatus[];
  summary: PaymentSummary | null;
  canOverride: boolean;
  /** The owner-only bulk upload tool. Front desk collects one payment at a time. */
  canBulkUpload?: boolean;
  timezone: string;
  /** Branches the desk can record cash against; empty hides the branch choice. */
  institutes?: { id: string; name: string }[];
  /** This user's cash today; null when the end-of-day count is off or could not be read. */
  todaysCash?: CashSummary | null;
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function AdminPayments({
  payments,
  total,
  pageSize,
  page,
  month,
  status,
  statuses,
  summary,
  canOverride,
  canBulkUpload = false,
  timezone,
  institutes = [],
  todaysCash = null,
}: Props) {
  const router = useRouter();
  const [selectedOverride, setSelectedOverride] = useState<Payment | null>(null);
  const [selectedLedger, setSelectedLedger] = useState<Payment | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Rebuild the URL from the current controls; any filter change resets to page 1.
  const go = (next: { month?: string; status?: string }): void => {
    const q = new URLSearchParams();
    q.set("month", next.month ?? month);
    const st = next.status ?? status;
    if (st && st !== "all") q.set("status", st);
    router.push(`/payments?${q.toString()}`);
  };

  const pageHref = (p: number): string => {
    const q = new URLSearchParams();
    q.set("month", month);
    if (status !== "all") q.set("status", status);
    if (p > 1) q.set("page", String(p));
    return `/payments?${q.toString()}`;
  };

  const stats = [
    { label: "Collected", value: summary ? formatCurrency(summary.collectedTotal) : "—" },
    { label: "Paid", value: summary?.paidCount ?? "—" },
    { label: "Pending", value: summary?.pendingCount ?? "—" },
    { label: "Failed", value: summary?.failedCount ?? "—" },
    { label: "Refunded", value: summary?.refundedCount ?? "—" },
  ];

  return (
    <div className="space-y-6">
      {/* Month summary */}
      <div className="grid gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && go({ month: e.target.value })}
            aria-label="Filter by month"
            className={inputClass}
          />
        </label>
        <select
          value={status}
          onChange={(e) => go({ status: e.target.value })}
          aria-label="Filter by status"
          className={inputClass}
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <Link
          href={`/payments/owing?month=${month}`}
          className="ml-auto inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          Who owes
        </Link>
        <Link
          href="/payments/cash"
          className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          Cash
        </Link>
      </div>

      {/* Records */}
      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No payments for these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canOverride && <th className="px-4 py-3 font-medium">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p) => (
                <tr key={p.id} className="bg-card">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{p.enrollment.user.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      #{p.enrollment.user.indexNumber}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {p.enrollment.course.name}
                    <span className="text-muted-foreground"> · {p.enrollment.course.year}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.paymentMonth}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCurrency(p.amount)}
                    {Number(p.refundedAmount) > 0 && (
                      <p className="text-xs text-sky-600">−{formatCurrency(p.refundedAmount)} refunded</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={p.status} />
                  </td>
                  {canOverride && (
                    <td className="space-y-1 px-4 py-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Override ${p.enrollment.user.name}'s payment`}
                        onClick={() => { setSelectedLedger(null); setSelectedOverride(p); }}
                      >
                        Override
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Refund or view ledger for ${p.enrollment.user.name}`}
                        onClick={() => { setSelectedOverride(null); setSelectedLedger(p); }}
                      >
                        Refund / ledger
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOverride && (
        <PaymentOverrideForm payment={selectedOverride} onClose={() => setSelectedOverride(null)} />
      )}
      {selectedLedger && (
        <PaymentAdjustmentPanel payment={selectedLedger} onClose={() => setSelectedLedger(null)} />
      )}

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} payment{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={pageHref(page - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Prev
              </a>
            )}
            {page < totalPages && (
              <a
                href={pageHref(page + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted"
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Collect at entrance */}
      {todaysCash && <TodaysCash summary={todaysCash} />}
      <CollectPayment timezone={timezone} institutes={institutes} />

      {canBulkUpload && <BulkUpload />}
    </div>
  );
}
