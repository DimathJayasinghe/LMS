import { guard401, requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import Link from "next/link";
import { PageHeader } from "@/components/custom/PageHeader";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-server";
import type { ApiList, Course, Institute, TimetableSlot, UpcomingTimetableSession } from "@/lib/types";
import { TimetableManager } from "./_components/TimetableManager";
import { LiveClassAction } from "../classes/[classId]/_components/LiveClassAction";
import { canGoLive, classModeLabel } from "@/lib/class-mode";

// Render Monday-first; API dayOfWeek is 0=Sun … 6=Sat.
const WEEK: { day: number; label: string }[] = [
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
  { day: 0, label: "Sunday" },
];

/** "16:00" → "4:00 PM". */
function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Start "16:00" + 120 min → "4:00 PM – 6:00 PM". */
function timeRange(start: string, durationMinutes: number): string {
  const [h, m] = start.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return formatTime(start);
  const end = (h * 60 + m + durationMinutes) % (24 * 60);
  const endHHmm = `${Math.floor(end / 60)
    .toString()
    .padStart(2, "0")}:${(end % 60).toString().padStart(2, "0")}`;
  return `${formatTime(start)} – ${formatTime(endHHmm)}`;
}

export default async function TimetablePage() {
  const cookie = (await cookies()).toString();

  const now = new Date();
  const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [slotList, classList, instituteList, upcomingList, me] = await Promise.all([
    guard401(api.get<ApiList<TimetableSlot>>("/timetable/slots", { cookie })),
    guard401(api.get<ApiList<Course>>("/classes", { cookie })),
    guard401(api.get<ApiList<Institute>>("/institutes", { cookie })),
    guard401(api.get<ApiList<UpcomingTimetableSession>>(`/timetable/sessions?from=${encodeURIComponent(now.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { cookie })),
    requireUser(cookie),
  ]);
  const slots = slotList.data;
  const courses = classList.data;
  const institutes = instituteList.data;
  const upcoming = upcomingList.data;
  const user = me;

  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const canManage = ["SUPER_ADMIN", "TEACHER", "ADMIN"].includes(user.role);

  // Group slots by day, sorted by start time within each day.
  const byDay = new Map<number, TimetableSlot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push(slot);
    byDay.set(slot.dayOfWeek, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Timetable" description="Your weekly class schedule." />

      {canManage && <TimetableManager courses={courses} institutes={institutes} slots={slots} />}

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No timetable slots have been scheduled yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          {WEEK.map(({ day, label }, i) => {
            const daySlots = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                className={`flex flex-col gap-3 p-4 sm:flex-row ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="w-28 shrink-0 pt-1 text-sm font-medium text-foreground">
                  {label}
                </div>
                <div className="flex-1">
                  {daySlots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No classes</p>
                  ) : (
                    <ul className="space-y-2">
                      {daySlots.map((slot) => (
                        <li
                          key={slot.id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 ${
                            slot.isActive ? "" : "opacity-60"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {slot.title ?? courseName.get(slot.courseId) ?? "Class"}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {timeRange(slot.startTime, slot.durationMinutes)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!slot.isActive && <Badge variant="secondary">Inactive</Badge>}
                            <Badge variant="outline">{classModeLabel(slot.classType)}</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Upcoming class sessions</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No sessions in the next 30 days.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
                <div>
                  <Link href={`/classes/${session.courseId}`} className="font-medium hover:underline">{session.title}</Link>
                  <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" }).format(new Date(session.date))}</p>
                </div>
                {canGoLive(session.classType) && (
                  <LiveClassAction
                    classId={session.courseId}
                    sessionId={session.id}
                    scheduled={session.liveScheduled}
                    isStaff={user.role === "SUPER_ADMIN" || user.role === "TEACHER"}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
