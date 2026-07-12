import { Badge } from "@/components/ui/badge";
import type { PaymentStatus } from "@/lib/types";

const STYLES: Record<PaymentStatus, string> = {
  SUCCESS: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  PENDING: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  FAILED: "border-destructive/40 text-destructive",
};

const LABELS: Record<PaymentStatus, string> = {
  SUCCESS: "Paid",
  PENDING: "Pending",
  FAILED: "Failed",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status]}>
      {LABELS[status]}
    </Badge>
  );
}
