import { guard401, requireUser } from "@/lib/session";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { VideoForm } from "./_components/VideoForm";
import { api } from "@/lib/api-server";
import type { ApiList, ClassSession } from "@/lib/types";

export const metadata = { title: "Upload recording · LMS" };

export default async function NewVideoPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { classId } = await params;

  const user = await requireUser(cookie);
  if (user.role !== "TEACHER" && user.role !== "SUPER_ADMIN") redirect(`/classes/${classId}`);

  const sessions = await guard401(api
    .get<ApiList<ClassSession>>(`/classes/${classId}/sessions`, { cookie }))
    .then((r) => r.data)
    .catch((error) => { unstable_rethrow(error); return [] as ClassSession[]; });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/classes/${classId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to class
      </Link>

      <PageHeader title="Upload recording" description="Upload a video for a session, straight to Bunny." />

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          Create a session first, then upload its recording.
        </div>
      ) : (
        <VideoForm classId={classId} sessions={sessions} />
      )}
    </div>
  );
}
