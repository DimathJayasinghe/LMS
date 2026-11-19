"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { ApiSuccess, Payment, PaymentStatus } from "@/lib/types";

type OverrideStatus = Exclude<PaymentStatus, "REFUNDED">;

interface OverrideFields {
  status: OverrideStatus;
  amount: number;
  note: string;
}

const statuses: OverrideStatus[] = ["PENDING", "SUCCESS", "FAILED"];
const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function PaymentOverrideForm({
  payment,
  onClose,
}: {
  payment: Payment;
  onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OverrideFields>({
    mode: "onBlur",
    defaultValues: {
      status: payment.status === "REFUNDED" ? "FAILED" : payment.status,
      amount: Number(payment.amount),
      note: "",
    },
  });

  const submit = async (fields: OverrideFields): Promise<void> => {
    setServerError(null);
    setSuccess(false);
    try {
      await api.patch<ApiSuccess<Payment>>(
        `/payments/${payment.id}/override`,
        { ...fields, note: fields.note.trim() || undefined },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setSuccess(true);
      router.refresh();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Payment override failed. Try again.");
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Review payment override</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {payment.enrollment.user.name} · {payment.enrollment.course.name} · {payment.paymentMonth} · currently{" "}
          {formatCurrency(payment.amount)} / {payment.status.toLowerCase()}.
        </p>
      </div>

      <form onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="override-status">Status</Label>
          <select id="override-status" aria-label="Override status" className={`${inputClass} w-full`} {...register("status")}>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="override-amount">Amount (LKR)</Label>
          <Input
            id="override-amount"
            aria-label="Override amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            aria-invalid={Boolean(errors.amount)}
            {...register("amount", {
              valueAsNumber: true,
              required: "Amount is required.",
              min: { value: 0.01, message: "Amount must be greater than zero." },
            })}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="override-note">Reason</Label>
          <Input
            id="override-note"
            aria-label="Override note"
            maxLength={500}
            aria-invalid={Boolean(errors.note)}
            {...register("note", {
              required: "A reason is required.",
              minLength: { value: 3, message: "Reason must be at least 3 characters." },
              maxLength: { value: 500, message: "Reason must be 500 characters or less." },
            })}
          />
          {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Apply override
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <span aria-live="polite" className="text-sm">
            {serverError && <span className="text-destructive">{serverError}</span>}
            {success && <span className="text-emerald-600">Payment override saved.</span>}
          </span>
        </div>
      </form>
    </section>
  );
}
