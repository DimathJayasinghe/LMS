"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { RefundPaymentForm } from "./RefundPaymentForm";
import type { ApiList, Payment, PaymentAdjustment, RefundPaymentResult } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" });

export function PaymentAdjustmentPanel({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const router = useRouter();
  const [adjustments, setAdjustments] = useState<PaymentAdjustment[] | null>(null);
  const [remaining, setRemaining] = useState(Number(payment.amount) - Number(payment.refundedAmount));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<ApiList<PaymentAdjustment>>(`/payments/${payment.id}/adjustments`)
      .then((result) => { if (!cancelled) setAdjustments(result.data); })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Couldn't load payment adjustments.");
      });
    return () => { cancelled = true; };
  }, [payment.id]);

  const recorded = (result: RefundPaymentResult): void => {
    setAdjustments((current) => [result.adjustment, ...(current ?? [])]);
    setRemaining(Number(result.remainingRefundable));
    setSuccess(true);
    router.refresh();
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4" aria-label="Payment adjustment ledger">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Refunds and adjustment ledger</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {payment.enrollment.user.name} · {payment.enrollment.course.name} · {payment.paymentMonth}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Close payment ledger" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>

      {payment.status === "SUCCESS" && remaining > 0 && (
        <RefundPaymentForm paymentId={payment.id} remaining={remaining} onRecorded={recorded} />
      )}
      {success && <p aria-live="polite" className="text-sm text-emerald-600">Completed refund recorded.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {adjustments === null && !error && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading adjustments" />}
      {adjustments?.length === 0 && <p className="text-sm text-muted-foreground">No adjustments recorded.</p>}
      {adjustments && adjustments.length > 0 && (
        <ul className="space-y-2">
          {adjustments.map((entry) => (
            <li key={entry.id} className="rounded-xl bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {entry.type === "REFUND" ? `Refund · ${formatCurrency(entry.amount ?? 0)}` : "Manual override"}
                </span>
                <span className="text-xs text-muted-foreground">{dateFmt.format(new Date(entry.createdAt))}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{entry.reason} · by {entry.createdBy.name}</p>
              {entry.externalReference && <p className="mt-1 text-xs text-muted-foreground">Reference: {entry.externalReference}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
