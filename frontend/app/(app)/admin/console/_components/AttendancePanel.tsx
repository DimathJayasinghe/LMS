import { loadPanel } from "@/lib/console";
import { consoleTime, plural } from "@/lib/console-format";
import type { ConsoleAttendance, ConsoleAttendanceSession } from "@/lib/types";
import { PanelShell, Stat, StatRow } from "./PanelShell";

const MODES = { ONLINE: "online", PHYSICAL: "in person" } as const;

function SessionLine({ session }: { session: ConsoleAttendanceSession }) {
  const where = [session.instituteName, session.classType ? MODES[session.classType] : null].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
      <span className="text-foreground">
        <span className="mr-2 tabular-nums text-muted-foreground">{consoleTime(session.startsAt)}</span>
        {session.title}
        <span className="text-muted-foreground"> · {session.courseName}{where ? ` · ${where}` : ""}</span>
      </span>
      <span className="tabular-nums text-foreground">{session.scanned}<span className="text-xs text-muted-foreground"> of {session.enrolled} scanned</span></span>
    </li>
  );
}

export async function AttendancePanel({ cookie }: { cookie: string }) {
  const result = await loadPanel<ConsoleAttendance>("/console/attendance-today", cookie);
  if (!result.ok) return <PanelShell title="Attendance today" failed />;
  const { date, sessions, flagged } = result.data;
  const scanned = sessions.reduce((sum, session) => sum + session.scanned, 0);
  const warnings = [
    { label: "without an enrollment", count: flagged.withoutEnrollment },
    { label: "enrolled online only", count: flagged.onlineOnly },
    { label: "without a paid month", count: flagged.unpaid },
  ];

  return (
    <PanelShell title="Attendance today" href="/attendance" linkLabel="Open attendance">
      <p className="mb-3 text-xs text-muted-foreground">{date}</p>
      <StatRow>
        <Stat label="Classes today" value={String(sessions.length)} />
        <Stat label="Scanned in" value={String(scanned)} />
      </StatRow>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No class is scheduled for today.</p>
      ) : (
        <ul className="divide-y divide-border">{sessions.map((session) => <SessionLine key={session.sessionId} session={session} />)}</ul>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-medium text-foreground">Scans that broke a rule since {flagged.from}</h3>
        <ul className="divide-y divide-border">
          {warnings.map(({ label, count }) => (
            <li key={label} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className={count > 0 ? "text-destructive" : "text-foreground"}>{plural(count, "scan")} {label}</span>
              {count === 0 && <span className="text-xs text-muted-foreground">None</span>}
            </li>
          ))}
        </ul>
      </div>
    </PanelShell>
  );
}
