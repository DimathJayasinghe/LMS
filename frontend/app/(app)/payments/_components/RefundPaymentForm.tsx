"use client";

import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { ApiSuccess, RefundPaymentResult } from "@/lib/types";

interface RefundFields {
  amount: number;
  reason: string;
  externalReference: string;
}

export function RefundPaymentForm({
  paymentId,
  remaining,
  onRecorded,
}: {
  paymentId: string;
  remaining: number;
  onRecorded: (result: RefundPaymentResult) => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RefundFields>({ mode: "onBlur" });

  const submit = async (fields: RefundFields): Promise<void> => {
    try {
      const response = await api.post<ApiSuccess<RefundPaymentResult>>(
        `/payments/${paymentId}/refunds`,
        fields,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      onRecorded(response.data);
      reset();
    } catch (error) {
      setError("root", {
        message: error instanceof ApiError ? error.message : "Refund recording failed. Try again.",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-3 rounded-xl border border-border bg-background p-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Record completed refund</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Use this only after returning the money outside the LMS. Remaining: {formatCurrency(remaining)}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount" error={errors.amount?.message}>
          <Input
            aria-label="Refund amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            aria-invalid={Boolean(errors.amount)}
            {...register("amount", {
              valueAsNumber: true,
              required: "Amount is required.",
              min: { value: 0.01, message: "Amount must be greater than zero." },
              max: { value: remaining, message: `Refund cannot exceed ${formatCurrency(remaining)}.` },
            })}
          />
        </Field>
        <Field label="Reason" error={errors.reason?.message}>
          <Input
            aria-label="Refund reason"
            aria-invalid={Boolean(errors.reason)}
            {...register("reason", {
              required: "Reason is required.",
              minLength: { value: 3, message: "Reason must be at least 3 characters." },
              maxLength: { value: 500, message: "Reason must be 500 characters or less." },
            })}
          />
        </Field>
        <Field label="External reference" error={errors.externalReference?.message}>
          <Input
            aria-label="Refund external reference"
            aria-invalid={Boolean(errors.externalReference)}
            placeholder="PayHere, bank, or cash receipt ref"
            {...register("externalReference", {
              required: "External reference is required.",
              minLength: { value: 3, message: "Reference must be at least 3 characters." },
              maxLength: { value: 120, message: "Reference must be 120 characters or less." },
            })}
          />
        </Field>
      </div>
      {errors.root && <p className="text-xs text-destructive">{errors.root.message}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        Record completed refund
      </Button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>;
}
