import { guard401, requireUser } from "@/lib/session";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, Lock, Pencil, PlayCircle, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EnrollPanel from "./_components/EnrollPanel";
import { LiveClassAction } from "./_components/LiveClassAction";
import { CourseSeenTracker } from "./_components/CourseSeenTracker";
import { CourseModules } from "./_components/CourseModules";
import { api } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/video";
import type {
  ApiList,
  ApiSuccess,
  ClassSession,
  Course,
  CourseModule,
  Enrollment,
  Subject,
  VideoRecording,
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

  const user = await requireUser(cookie);

  // Front desk and marker accounts never open recordings (the API refuses them).
  const canOpenRecordings = user.role !== "ADMIN" && user.role !== "MARKER";

  let course: Course;
  try {
    course = (await guard401(api.get<ApiSuccess<Course>>(`/classes/${classId}`, { cookie }))).data;
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const [subjectName, modulesResult, sessionsResult, videosResult, active] = await Promise.all([
    // Subject name (payload carries only subjectId).
    (async () => {
      try {
        return (
          await guard401(api.get<ApiSuccess<Subject>>(`/subjects/${course.subjectId}`, { cookie }))
        ).data.name;
      } catch (error) {
        unstable_rethrow(error);
        return undefined;
      }
    })(),
    (async (): Promise<{ modules: CourseModule[]; gated: boolean }> => {
      try {
        const res = await guard401(api.get<ApiList<CourseModule>>(`/classes/${classId}/modules`, { cookie }));
        return { modules: res.data, gated: false };
      } catch (e) {
        unstable_rethrow(e);
        const gated = e instanceof ApiError && (e.code === "NOT_ENROLLED" || e.status === 403);
        return { modules: [], gated };
      }
    })(),
    // Sessions — students who aren't enrolled get 403 NOT_ENROLLED.
    (async (): Promise<{ sessions: ClassSession[]; gated: boolean }> => {
      try {
        const res = await guard401(api.get<ApiList<ClassSession>>(
          `/classes/${classId}/sessions`,
          { cookie },
        ));
        return { sessions: res.data, gated: false };
      } catch (e) {
        unstable_rethrow(e);
        const gated =
          e instanceof ApiError && (e.code === "NOT_ENROLLED" || e.status === 403);
        return { sessions: [], gated };
      }
    })(),
    // Recordings — students without an active enrollment get 403. Roles that can
    // never open recordings skip the call, as it would only 403.
    (async (): Promise<{ videos: VideoRecording[]; gated: boolean }> => {
      if (!canOpenRecordings) return { videos: [], gated: false };
      try {
        const res = await guard401(api.get<ApiList<VideoRecording>>(
          `/videos/class/${classId}?limit=50`,
          { cookie },
        ));
        return { videos: res.data, gated: false };
      } catch (e) {
        unstable_rethrow(e);
        const gated =
          e instanceof ApiError && (e.code === "NOT_ENROLLED" || e.status === 403);
        return { videos: [], gated };
      }
    })(),
    // The viewer's active enrollment for this course (students only).
    (async (): Promise<{ id: string; classType: "ONLINE" | "PHYSICAL" } | null> => {
      if (user.role !== "STUDENT") return null;
      try {
        const mine = (
          await guard401(api.get<ApiList<Enrollment>>(
            `/enrollments/my?courseId=${classId}&isActive=true`,
            { cookie },
          ))
        ).data;
        return mine[0] ? { id: mine[0].id, classType: mine[0].classType } : null;
      } catch (error) {
        unstable_rethrow(error);
        return null;
      }
    })(),
  ]);

  const { sessions, gated } = sessionsResult;
  const { videos, gated: videosGated } = videosResult;
  const { modules, gated: modulesGated } = modulesResult;
  const banner = course.backdropUrl ?? course.bannerUrl;
  const isStaff = user.role === "TEACHER" || user.role === "SUPER_ADMIN";

  return (
    <div className="mx-auto max-w-5xl">
      {user.role === "STUDENT" && active && <CourseSeenTracker courseId={course.id} />}
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

      {isStaff && (
        <div className="mb-6 flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href={`/classes/${classId}/edit`}><Pencil aria-hidden />Edit class</Link>
          </Button>
        </div>
      )}

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

          {!modulesGated && (
            <CourseModules classId={classId} initialModules={modules} canManage={isStaff} />
          )}

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden />
                Sessions
              </h2>
              {isStaff && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/classes/${classId}/sessions/new`}>
                    <Plus aria-hidden />
                    New session
                  </Link>
                </Button>
              )}
            </div>

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
                      {session.classType === "ONLINE" && (
                        <LiveClassAction
                          classId={classId}
                          sessionId={session.id}
                          scheduled={session.liveScheduled}
                          isStaff={isStaff}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!canOpenRecordings && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                <PlayCircle className="size-4" aria-hidden />
                Recordings
              </h2>
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                Recordings are available to students and the class teacher.
              </div>
            </section>
          )}

          {canOpenRecordings && !videosGated && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  <PlayCircle className="size-4" aria-hidden />
                  Recordings
                </h2>
                {isStaff && sessions.length > 0 && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/classes/${classId}/videos/new`}>
                      <Plus aria-hidden />
                      Upload recording
                    </Link>
                  </Button>
                )}
              </div>

              {videos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                  No recordings have been published yet.
                </div>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {videos.map((video) => {
                    const duration = formatDuration(video.durationSeconds);
                    const ready = video.status === "READY";
                    const rowContent = (
                      <>
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <PlayCircle className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {video.title}
                          </span>
                          {(video.classSession?.title || duration) && (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {video.classSession?.title}
                              {video.classSession?.title && duration ? " · " : ""}
                              {duration}
                            </span>
                          )}
                        </span>
                        {video.status === "UPLOADING" && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                            Processing
                          </Badge>
                        )}
                        {video.status === "FAILED" && (
                          <Badge variant="outline" className="border-destructive/40 text-destructive">
                            Failed
                          </Badge>
                        )}
                      </>
                    );
                    return (
                      <li key={video.id} className="bg-card">
                        {ready ? (
                          <Link
                            href={`/classes/${classId}/videos/${video.id}`}
                            className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
                          >
                            {rowContent}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 p-4">{rowContent}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <EnrollPanel
            timezone={user.organization?.timezone ?? "Asia/Colombo"}
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
