import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, Lock, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import EnrollPanel from "./_components/EnrollPanel";
import { api, ApiError } from "@/lib/api";
import type {
  ApiList,
  ApiSuccess,
  ClassSession,
  Course,
  Enrollment,
  Subject,
  User,
} from "@/lib/types";

/** Format a session instant in Asia/Colombo, e.g. "Wed, 13 May · 4:00 PM". */
function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Colombo",
  });
  const time = date.toLocaleTimeString("en-LK", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Colombo",
  });
  return `${day} · ${time}`;
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { classId } = await params;

  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }

  let course: Course;
  try {
    course = (await api.get<ApiSuccess<Course>>(`/classes/${classId}`, { cookie })).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [subjectName, sessionsResult, active] = await Promise.all([
    // Subject name (payload carries only subjectId).
    (async () => {
      try {
        return (
          await api.get<ApiSuccess<Subject>>(`/subjects/${course.subjectId}`, { cookie })
        ).data.name;
      } catch {
        return undefined;
      }
    })(),
    // Sessions — students who aren't enrolled get 403 NOT_ENROLLED.
    (async (): Promise<{ sessions: ClassSession[]; gated: boolean }> => {
      try {
        const res = await api.get<ApiList<ClassSession>>(
          `/classes/${classId}/sessions`,
          { cookie },
        );
        return { sessions: res.data, gated: false };
      } catch (e) {
        const gated =
          e instanceof ApiError && (e.code === "NOT_ENROLLED" || e.status === 403);
        return { sessions: [], gated };
      }
    })(),
    // The viewer's active enrollment for this course (students only).
    (async (): Promise<{ id: string; classType: "ONLINE" | "PHYSICAL" } | null> => {
      if (user.role !== "STUDENT") return null;
      try {
        const mine = (
          await api.get<ApiList<Enrollment>>(
            `/enrollments/my?courseId=${classId}&isActive=true`,
            { cookie },
          )
        ).data;
        return mine[0] ? { id: mine[0].id, classType: mine[0].classType } : null;
      } catch {
        return null;
      }
    })(),
  ]);

  const { sessions, gated } = sessionsResult;
  const banner = course.backdropUrl ?? course.bannerUrl;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/classes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All classes
      </Link>

      <div
        className="relative mb-6 flex min-h-40 items-end overflow-hidden rounded-2xl border border-border bg-muted p-6"
        style={
          banner
            ? {
                backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0.1)), url(${banner})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className={banner ? "text-white" : "text-foreground"}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {subjectName && (
              <Badge variant={banner ? "secondary" : "outline"}>{subjectName}</Badge>
            )}
            {course.year != null && (
              <span className={banner ? "text-sm text-white/80" : "text-sm text-muted-foreground"}>
                {course.year}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{course.name}</h1>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {course.description && (
            <section>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                About
              </h2>
              <p className="text-sm leading-relaxed text-foreground">
                {course.description}
              </p>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              Sessions
            </h2>

            {gated ? (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                <Lock className="size-4 shrink-0" aria-hidden />
                Enroll in this class to see its schedule and join sessions.
              </div>
            ) : sessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                No sessions have been scheduled yet.
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 bg-card p-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {session.title ?? "Class session"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" aria-hidden />
                        {formatSessionDate(session.date)} · {session.durationMinutes} min
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {session.classType && (
                        <Badge variant="outline">
                          {session.classType === "ONLINE" ? "Online" : "Physical"}
                        </Badge>
                      )}
                      {session.zoomLink && (
                        <a
                          href={session.zoomLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          <Video className="size-4" aria-hidden />
                          Join
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <EnrollPanel
            courseId={course.id}
            monthlyFee={course.monthlyFee}
            active={active}
            isStudent={user.role === "STUDENT"}
          />
        </aside>
      </div>
    </div>
  );
}
