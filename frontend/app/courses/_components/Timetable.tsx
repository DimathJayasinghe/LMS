import { Clock, MapPin, Video } from "lucide-react";
import ScrollReveal from "@/app/home/_components/ScrollReveal";
import type { PublicUpcomingSession } from "@/lib/types";

const TIMEZONE = "Asia/Colombo";

const dayHeadingFormatter = new Intl.DateTimeFormat("en-LK", {
  timeZone: TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("en-LK", {
  timeZone: TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

function dayKey(iso: string): string {
  // Calendar day in institute-local time, used purely for grouping.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(iso));
}

function groupByDay(sessions: PublicUpcomingSession[]): { key: string; sessions: PublicUpcomingSession[] }[] {
  const groups = new Map<string, PublicUpcomingSession[]>();
  for (const session of sessions) {
    const key = dayKey(session.date);
    const existing = groups.get(key);
    if (existing) existing.push(session);
    else groups.set(key, [session]);
  }
  return Array.from(groups, ([key, sessions]) => ({ key, sessions }));
}

/**
 * Combined upcoming timetable across every active course, sourced from
 * `GET /timetable/public/upcoming` — real teacher-scheduled sessions, not
 * placeholder data. Rendered as grouped rows rather than a card grid: rows
 * don't have the equal-height problem cards in a grid do, and a schedule
 * reads better as a list anyway.
 */
export default function Timetable({ sessions }: { sessions: PublicUpcomingSession[] }) {
  if (sessions.length === 0) {
    return (
      <ScrollReveal className="mx-auto max-w-2xl rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
        No sessions scheduled in the next couple of weeks — check back soon.
      </ScrollReveal>
    );
  }

  const groups = groupByDay(sessions);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      {groups.map((group, i) => (
        <ScrollReveal key={group.key} delay={Math.min(i * 0.08, 0.4)}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {dayHeadingFormatter.format(new Date(group.sessions[0]!.date))}
          </h3>

          <div className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
            {group.sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="font-medium text-foreground">{session.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {session.course.subject.name} · {session.course.name}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-4" aria-hidden />
                    {timeFormatter.format(new Date(session.date))} · {session.durationMinutes}min
                  </span>
                  {session.classType && (
                    <span className="flex items-center gap-1.5">
                      {session.classType === "ONLINE" ? (
                        <Video className="size-4" aria-hidden />
                      ) : (
                        <MapPin className="size-4" aria-hidden />
                      )}
                      {session.classType === "ONLINE" ? "Online" : "In person"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      ))}
    </div>
  );
}
