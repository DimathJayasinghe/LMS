"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CreditCard, Loader2, Monitor, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { EnrollmentMode } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { currentPaymentMonth, initiatePayherePayment, redirectToPayhere } from "@/lib/payhere";

interface ActiveEnrollment {
  id: string;
  classType: EnrollmentMode;
}

interface EnrollPanelProps {
  courseId: string;
  monthlyFee: string;
  /** The viewer's active enrollment for this course, if any. */
  active: ActiveEnrollment | null;
  /** Enroll/pay is student-only; staff see a passive note instead. */
  isStudent: boolean;
}

const MODES: { value: EnrollmentMode; label: string; icon: typeof Monitor }[] = [
  { value: "ONLINE", label: "Online", icon: Monitor },
  { value: "PHYSICAL", label: "Physical", icon: MapPin },
];

export default function EnrollPanel({
  courseId,
  monthlyFee,
  active,
  isStudent,
}: EnrollPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<EnrollmentMode>("ONLINE");
  const [busy, setBusy] = useState<null | "enroll" | "pay" | "drop">(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "enroll" | "pay" | "drop", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleEnroll = () =>
    run("enroll", async () => {
      await api.post("/enrollments", { courseId, classType: mode });
      router.refresh();
    });

  const handlePay = () =>
    run("pay", async () => {
      if (!active) return;
      const res = await initiatePayherePayment(active.id, currentPaymentMonth());
      redirectToPayhere(res.data.checkoutUrl, res.data.payload);
    });

  const handleDrop = () =>
    run("drop", async () => {
      if (!active) return;
      await api.del(`/enrollments/${active.id}`);
      router.refresh();
    });

  if (!isStudent) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-medium text-foreground">
          {formatCurrency(monthlyFee)}
          <span className="text-xs font-normal text-muted-foreground"> / month</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Enrollment and payment are available to students.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-lg font-semibold text-foreground">
        {formatCurrency(monthlyFee)}
        <span className="text-sm font-normal text-muted-foreground"> / month</span>
      </p>

      {active ? (
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <BadgeCheck className="size-4 text-primary" aria-hidden />
            Enrolled ·{" "}
            <span className="text-muted-foreground">
              {active.classType === "ONLINE" ? "Online" : "Physical"}
            </span>
          </p>
          <Button onClick={handlePay} disabled={busy !== null} className="w-full">
            {busy === "pay" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <CreditCard aria-hidden />
            )}
            Pay this month&apos;s fee
          </Button>
          <Button
            onClick={handleDrop}
            disabled={busy !== null}
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
          >
            {busy === "drop" && <Loader2 className="animate-spin" aria-hidden />}
            Drop this class
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mode
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    mode === value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleEnroll} disabled={busy !== null} className="w-full">
            {busy === "enroll" && <Loader2 className="animate-spin" aria-hidden />}
            Enroll now
          </Button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
