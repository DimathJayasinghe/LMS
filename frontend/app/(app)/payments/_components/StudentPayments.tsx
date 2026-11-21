"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { initiatePayherePayment, startPayherePayment } from "@/lib/payhere";
import { PayhereScript } from "@/components/custom/PayhereScript";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import type { Enrollment, Payment, PaymentStatus } from "@/lib/types";

interface Props {
  enrollments: Enrollment[];
  payments: Payment[];
  currentMonth: string;
}

type StatusFilter = "all" | PaymentStatus;

export function StudentPayments({ enrollments, payments, currentMonth }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const [notice, setNotice] = useState<{ id: string; msg: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const pay = async (enrollmentId: string): Promise<void> => {
    setBusyId(enrollmentId);
    setError(null);
    setNotice(null);
    try {
      const res = await initiatePayherePayment(enrollmentId, currentMonth);
      // Onsite modal — the button stays busy until a callback fires.
      startPayherePayment(res.data, {
        onCompleted: () => {
          setBusyId(null);
          setNotice({
            id: enrollmentId,
            msg: "Payment submitted — it'll show as paid once confirmed.",
          });
          router.refresh();
        },
        onDismissed: () => setBusyId(null),
        onError: (msg) => {
          setBusyId(null);
          setError({ id: enrollmentId, msg: msg || "Payment failed. Please try again." });
        },
      });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.code === "PAYHERE_NOT_CONFIGURED"
            ? "Online payment isn't available yet. Please pay at the center."
            : e.message
          : "Something went wrong, try again.";
      setError({ id: enrollmentId, msg });
      setBusyId(null);
    }
  };

  const history = useMemo(
    () => (statusFilter === "all" ? payments : payments.filter((p) => p.status === statusFilter)),
    [payments, statusFilter],
  );

  return (
    <div className="space-y-8">
      <PayhereScript />
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">This month · {currentMonth}</h2>
        {enrollments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            You&apos;re not enrolled in any courses yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {enrollments.map((e) => {
              const paid = payments.some(
                (p) =>
                  p.enrollment.id === e.id &&
                  p.paymentMonth === currentMonth &&
                  p.status === "SUCCESS",
              );
              const busy = busyId === e.id;
              return (
                <div key={e.id} className="rounded-2xl border border-border bg-card p-4">
                  <p className="font-medium text-foreground">{e.course.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(e.course.monthlyFee)} / month · {e.classType}
                  </p>
                  <div className="mt-3">
                    {paid ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        <BadgeCheck className="size-4" aria-hidden />
                        Paid for this month
                      </span>
                    ) : (
                      <Button size="sm" onClick={() => pay(e.id)} disabled={busy}>
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <CreditCard className="size-4" aria-hidden />
                        )}
                        Pay {formatCurrency(e.course.monthlyFee)}
                      </Button>
                    )}
                  </div>
                  {error?.id === e.id && (
                    <p className="mt-2 text-xs text-destructive">{error.msg}</p>
                  )}
                  {notice?.id === e.id && (
                    <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                      {notice.msg}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Payment history</h2>
          <div className="flex rounded-lg border border-border p-0.5 text-sm">
            {(["all", "SUCCESS", "PENDING", "FAILED"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-md px-3 py-1.5 capitalize transition-colors ${
                  statusFilter === f
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {payments.length === 0 ? "No payments yet." : "No payments match this filter."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((p) => (
                  <tr key={p.id} className="bg-card">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.paymentMonth}</td>
                    <td className="px-4 py-3 text-foreground">{p.enrollment.course.name}</td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "SUCCESS" && (
                        <Link href={`/payments/${p.id}`} target="_blank" className="text-xs text-primary hover:underline">
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
