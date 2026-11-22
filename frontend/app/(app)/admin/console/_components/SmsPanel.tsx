import { loadPanel } from "@/lib/console";
import { consoleDayTime } from "@/lib/console-format";
import { monthLabel } from "@/lib/reports";
import type { ConsoleSms } from "@/lib/types";
import { PanelShell, Stat, StatRow } from "./PanelShell";

export async function SmsPanel({ cookie }: { cookie: string }) {
  const result = await loadPanel<ConsoleSms>("/console/sms", cookie);
  if (!result.ok) return <PanelShell title="SMS" failed />;
  const { week, month, failures } = result.data;

  return (
    <PanelShell title="SMS">
      <p className="mb-3 text-xs text-muted-foreground">Last 7 days (since {week.from}) and {monthLabel(month.month)}</p>
      <StatRow>
        <Stat label="Sent, 7 days" value={String(week.sent)} />
        <Stat label="Failed, 7 days" value={String(week.failed)} tone={week.failed > 0 ? "alert" : undefined} />
        <Stat label="Sent, month" value={String(month.sent)} />
        <Stat label="Failed, month" value={String(month.failed)} tone={month.failed > 0 ? "alert" : undefined} />
      </StatRow>
      {(week.pending > 0 || month.pending > 0) && (
        <p className="mb-3 text-xs text-muted-foreground">Still waiting to be sent: {week.pending} in the last 7 days, {month.pending} this month.</p>
      )}

      <h3 className="text-sm font-medium text-foreground">Latest failures</h3>
      {failures.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No message has failed.</p>
      ) : (
        <ul className="divide-y divide-border">
          {failures.map((failure) => (
            <li key={failure.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="tabular-nums text-foreground">{failure.phone}</span>
                <span className="text-xs text-muted-foreground">{consoleDayTime(failure.at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{failure.reason ?? "No reason given"}</p>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
