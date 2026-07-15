"use client";

import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { formatCurrency } from "@/lib/utils";
import type { Payment, PaymentMethod } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

const METHOD_LABELS: Record<PaymentMethod, string> = {
  ONLINE: "Online (PayHere)",
  ENTRANCE: "Cash at entrance",
  BULK: "Bulk upload",
  MANUAL: "Manual override",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}

export function PaymentReceipt({ payment }: { payment: Payment }) {
  const receiptUrl = typeof window !== "undefined" ? window.location.href : payment.id;

  return (
    <div className="mx-auto max-w-lg space-y-6 py-10 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold text-foreground">Payment receipt</h1>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          Print
        </Button>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 font-mono text-sm print:border-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-dashed border-border pb-4">
          <div>
            <p className="text-base font-semibold text-foreground">{payment.enrollment.user.name}</p>
            <p className="text-muted-foreground">#{payment.enrollment.user.indexNumber}</p>
          </div>
          <PaymentStatusBadge status={payment.status} />
        </div>

        <dl className="space-y-2">
          <Row label="Course">
            {payment.enrollment.course.name} · {payment.enrollment.course.year} · {payment.enrollment.classType}
          </Row>
          <Row label="Month">{payment.paymentMonth}</Row>
          <Row label="Amount">{formatCurrency(payment.amount)}</Row>
          <Row label="Method">{METHOD_LABELS[payment.method]}</Row>
          {payment.method !== "ONLINE" && payment.collectedBy && (
            <Row label="Collected by">{payment.collectedBy.name}</Row>
          )}
          {payment.collectedAtInstitute && (
            <Row label="Center">
              {payment.collectedAtInstitute.name} ({payment.collectedAtInstitute.code})
            </Row>
          )}
          {payment.collectedViaBarcode && <Row label="Barcode used">{payment.collectedViaBarcode}</Row>}
          {payment.method === "ONLINE" && payment.payhereId && <Row label="PayHere ref">{payment.payhereId}</Row>}
          <Row label="Date">{dateFmt.format(new Date(payment.createdAt))}</Row>
        </dl>

        <div className="flex flex-col items-center gap-2 border-t border-dashed border-border pt-4">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={receiptUrl} size={140} level="M" marginSize={0} />
          </div>
          <p className="text-xs tracking-widest text-muted-foreground">{payment.id}</p>
        </div>
      </div>
    </div>
  );
}
