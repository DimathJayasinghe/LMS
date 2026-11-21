"use client";

import { useRouter } from "next/navigation";
import { summarizeCash } from "@/lib/cash";
import { formatCurrency } from "@/lib/utils";
import { CashDayRow } from "./CashDayRow";
import type { CashRow } from "@/lib/types";

interface Props {
  rows: CashRow[];
  from: string;
  to: string;
  tallyEnabled: boolean;
  viewerId: string;
  isOwner: boolean;
  institutes: { id: string; name: string }[];
  instituteId?: string;
  /** Owner view: only counted days that are not reconciled yet. */
  review: boolean;
}

const inputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function CashTally({ rows, from, to, tallyEnabled, viewerId, isOwner, institutes, instituteId, review }: Props) {
  const router = useRouter();
  const summary = summarizeCash(rows);

  const go = (next: { from?: string; to?: string; instituteId?: string; review?: boolean }): void => {
    const q = new URLSearchParams({ from: next.from ?? from, to: next.to ?? to });
    const branch = "instituteId" in next ? next.instituteId : instituteId;
    if (branch) q.set("instituteId", branch);
    if ("review" in next ? next.review : review) q.set("review", "1");
    router.push(`/payments/cash?${q.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input type="date" value={from} onChange={(e) => e.target.value && go({ from: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input type="date" value={to} onChange={(e) => e.target.value && go({ to: e.target.value })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Branch
          <select value={instituteId ?? ""} onChange={(e) => go({ instituteId: e.target.value || undefined })} className={inputClass}>
            <option value="">All branches</option>
            {institutes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
        {isOwner && tallyEnabled && (
          <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
            <input type="checkbox" checked={review} onChange={(e) => go({ review: e.target.checked })} aria-label="Counted days not reconciled yet" />
            Needs review
          </label>
        )}
      </div>

      {!tallyEnabled && (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          The end-of-day cash count is turned off. Cash totals are still shown.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          {review ? "No counted days are waiting for review." : "No cash collected in this range."}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(summary.amount)} from {summary.payments} payment{summary.payments === 1 ? "" : "s"}
            {tallyEnabled && summary.needCount > 0 && <> · <span className="text-foreground">{summary.needCount} day{summary.needCount === 1 ? "" : "s"} need{summary.needCount === 1 ? "s" : ""} a count</span></>}
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Day</th>
                  <th className="px-4 py-3 font-medium">Collector</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Cash taken</th>
                  <th className="px-4 py-3 font-medium">Count</th>
                  <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <CashDayRow key={`${row.collectorId}|${row.day}|${row.instituteId ?? ""}`} row={row} viewerId={viewerId} isOwner={isOwner} counting={tallyEnabled} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
