import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, Info } from "lucide-react";
import { VideoPlayer } from "@/components/features/VideoPlayer";
import { api, ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/video";
import type { ApiSuccess, User, VideoRecording } from "@/lib/types";

const sessionDateFmt = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeZone: "Asia/Colombo",
});

export default async function VideoPage({
  params,
}: {
  params: Promise<{ classId: string; videoId: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { classId, videoId } = await params;

  try {
    await api.get<ApiSuccess<User>>("/auth/me", { cookie });
  } catch {
    redirect("/auth/login");
  }

  let video: VideoRecording;
  try {
    video = (await api.get<ApiSuccess<VideoRecording>>(`/videos/${videoId}`, { cookie })).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const duration = formatDuration(video.durationSeconds);
  const sessionDate = video.classSession?.date;

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/classes/${classId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to class
      </Link>

      <VideoPlayer videoId={video.id} courseId={classId} classSessionId={video.classSessionId} />

      <header className="mt-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">{video.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {video.classSession?.title && <span>{video.classSession.title}</span>}
          {sessionDate && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden />
              {sessionDateFmt.format(new Date(sessionDate))}
            </span>
          )}
          {duration && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {duration}
            </span>
          )}
        </div>
      </header>

      <p className="mt-4 flex items-start gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Seeing a black screen with audio? Disconnect any external monitor or turn off your
        browser&apos;s hardware acceleration — the content protection is working as intended.
      </p>
    </div>
  );
}
