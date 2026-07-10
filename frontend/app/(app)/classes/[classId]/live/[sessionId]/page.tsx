import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { LiveClassRoom } from "./_components/LiveClassRoom";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, ClassSession, User } from "@/lib/types";

export default async function LiveClassPage({
  params,
}: {
  params: Promise<{ classId: string; sessionId: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { classId, sessionId } = await params;

  try {
    await api.get<ApiSuccess<User>>("/auth/me", { cookie });
  } catch {
    redirect("/auth/login");
  }

  let session: ClassSession;
  try {
    session = (
      await api.get<ApiSuccess<ClassSession>>(
        `/classes/${classId}/sessions/${sessionId}`,
        { cookie },
      )
    ).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  // Nothing to join yet — send back to the class page, where the schedule/join
  // CTA lives, rather than duplicating that UI here.
  if (session.classType !== "ONLINE" || !session.zoomMeetingId) {
    redirect(`/classes/${classId}`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/classes/${classId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to class
      </Link>

      <h1 className="mb-4 text-xl font-bold tracking-tight text-foreground">
        {session.title ?? "Live class"}
      </h1>

      <LiveClassRoom classId={classId} sessionId={sessionId} />

      <p className="mt-4 flex items-start gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        This meeting runs inside the LMS — you never leave the site. Screen recording of this
        page is against course terms; your name and a live timestamp are watermarked on screen.
      </p>
    </div>
  );
}
