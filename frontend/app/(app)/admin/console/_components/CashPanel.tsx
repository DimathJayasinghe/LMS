import Link from "next/link";
import { loadPanel, METHOD_LABELS } from "@/lib/console";
import { varianceLabel } from "@/lib/cash";
import { monthLabel } from "@/lib/reports";
import { formatCurrency } from "@/lib/utils";
import type { CashRow, ConsoleCash } from "@/lib/types";
import { PanelShell, Stat, StatRow } from "./PanelShell";

const money = (amount: number): string => formatCurrency(amount);

function countLabel(row: CashRow, tallyEnabled: boolean): string | null {
  if (!tallyEnabled) return null;
  if (!row.tally) return "Not counted";
  return row.tally.reconciledAt ? "Reconciled" : varianceLabel(row.tally.variance, money);
}

function RowLine({ row, tallyEnabled, withDay }: { row: CashRow; tallyEnabled: boolean; withDay?: boolean }) {
  const label = countLabel(row, tallyEnabled);
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
      <span className="text-foreground">
        {withDay && <span className="mr-2 tabular-nums text-muted-foreground">{row.day}</span>}
        {row.collectorName}
        <span className="text-muted-foreground"> · {row.instituteName ?? "No branch"}</span>
      </span>
      <span className="tabular-nums text-foreground">
        {formatCurrency(row.amount)}
        {label && <span className={`ml-2 text-xs ${row.tally?.flagged && !row.tally.reconciledAt ? "text-destructive" : "text-muted-foreground"}`}>{label}</span>}
      </span>
    </li>
  );
}

export async function CashPanel({ cookie }: { cookie: string }) {
  const result = await loadPanel<ConsoleCash>("/console/cash", cookie);
  if (!result.ok) return <PanelShell title="Cash today" failed />;
  const { date, tallyEnabled, collectedTotal, paymentCount, rows, flagged, unreconciled, month } = result.data;
  // Today's differing counts, plus every older counted day still waiting for the owner (older flagged ones are among them).
  const attention = flagged.filter((row) => row.day === date).length + unreconciled.count;

  return (
    <PanelShell title="Cash today" href="/payments/cash" linkLabel="Open cash">
      <p className="mb-3 text-xs text-muted-foreground">{date}</p>
      <StatRow>
        <Stat label="Collected" value={formatCurrency(collectedTotal)} />
        <Stat label="Payments" value={String(paymentCount)} />
        <Stat label="Needs attention" value={String(attention)} tone={attention > 0 ? "alert" : undefined} />
      </StatRow>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cash has been taken yet today.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => <RowLine key={`${row.collectorId}|${row.instituteId ?? ""}`} row={row} tallyEnabled={tallyEnabled} />)}
        </ul>
      )}

      {flagged.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-foreground">Counts that differ</h3>
          <ul className="divide-y divide-border">
            {flagged.map((row) => <RowLine key={`f|${row.day}|${row.collectorId}|${row.instituteId ?? ""}`} row={row} tallyEnabled={tallyEnabled} withDay />)}
          </ul>
        </div>
      )}

      {unreconciled.count > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {unreconciled.count} counted {unreconciled.count === 1 ? "day is" : "days are"} waiting for you to reconcile.{" "}
          <Link href={`/payments/cash?review=1&from=${unreconciled.from}&to=${unreconciled.to}`} className="text-foreground underline-offset-2 hover:underline">Review them</Link>
        </p>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-medium text-foreground">Fees for {monthLabel(month.month)}, by method</h3>
        {month.byMethod.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No fees recorded for this month yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {month.byMethod.map((entry) => (
              <li key={entry.method} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-foreground">{METHOD_LABELS[entry.method]}</span>
                <span className="tabular-nums text-foreground">{formatCurrency(entry.collected)}<span className="ml-2 text-xs text-muted-foreground">{entry.paidCount} paid</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}
