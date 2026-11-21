"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import { varianceLabel } from "@/lib/cash";
import { formatCurrency } from "@/lib/utils";
import type { CashRow } from "@/lib/types";

interface Props {
  row: CashRow;
  viewerId: string;
  isOwner: boolean;
  /** False when the owner turned the end-of-day count off: the row shows the cash and nothing to act on. */
  counting?: boolean;
}

const inputClass = "rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

export function CashDayRow({ row, viewerId, isOwner, counting = true }: Props) {
  const router = useRouter();
  const { tally } = row;
  const mine = counting && row.collectorId === viewerId;
  const [editing, setEditing] = useState(!tally);
  const [counted, setCounted] = useState(tally?.countedAmount ?? "");
  const [note, setNote] = useState(tally?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Number(counted);
  const valid = counted.trim() !== "" && Number.isFinite(amount) && amount >= 0;

  // Counting and reconciling share one flow: ask the server, show its reason on a refusal, otherwise reload the day.
  const run = async (request: () => Promise<unknown>, failure: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await request();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : failure);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = (): Promise<boolean> => run(() => api.post("/payments/cash-tally", {
    day: row.day,
    instituteId: row.instituteId,
    countedAmount: amount,
    ...(note.trim() ? { note: note.trim() } : {}),
  }), "Could not save the count. Try again.");
  const count = async (): Promise<void> => {
    if (await save()) setEditing(false);
  };
  const reconcile = async (): Promise<void> => {
    await run(() => api.patch(`/payments/cash-tally/${tally!.id}/reconcile`, {}), "Could not reconcile. Try again.");
  };

  return (
    <tr className="bg-card align-top">
      <td className="px-4 py-3 tabular-nums text-muted-foreground">{row.day}</td>
      <td className="px-4 py-3 text-foreground">{row.collectorName}</td>
      <td className="px-4 py-3 text-muted-foreground">{row.instituteName ?? "No branch"}</td>
      <td className="px-4 py-3">
        <p className="font-medium tabular-nums text-foreground">{formatCurrency(row.amount)}</p>
        <p className="text-xs text-muted-foreground">{row.paymentCount} payment{row.paymentCount === 1 ? "" : "s"}</p>
      </td>
      <td className="space-y-1 px-4 py-3">
        {tally ? (
          <>
            <p className="tabular-nums text-foreground">Counted {formatCurrency(tally.countedAmount)}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{varianceLabel(tally.variance, formatCurrency)}</Badge>
              {tally.flagged && <Badge variant="destructive">Needs a look</Badge>}
              {tally.staleSinceClose && <Badge variant="outline">Cash changed after the count</Badge>}
              {tally.reconciledAt && <Badge variant="outline">Reconciled by {tally.reconciledByName}</Badge>}
            </div>
            {tally.note && <p className="text-xs text-muted-foreground">{tally.note}</p>}
          </>
        ) : (
          <p className="text-muted-foreground">{counting ? "Not counted yet" : "—"}</p>
        )}
      </td>
      <td className="space-y-2 px-4 py-3">
        {mine && editing && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} aria-label={`Counted cash for ${row.day}`} placeholder="Counted" className={`${inputClass} w-28`} />
            <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} aria-label={`Note for ${row.day}`} placeholder="Note (optional)" className={`${inputClass} w-40`} />
            <Button type="button" size="sm" disabled={!valid || busy} onClick={count}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Count
            </Button>
          </div>
        )}
        {mine && !editing && !tally?.reconciledAt && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>Recount</Button>
        )}
        {counting && isOwner && tally && !tally.reconciledAt && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={reconcile}>Reconcile</Button>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  );
}
