import { requireUser } from "@/lib/session";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Ban, FileText, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExamStatusBadge } from "@/components/features/ExamStatusBadge";
import { ExamNotice } from "../../exams/[examId]/_components/ExamNotice";
import { GradeSubmissionRow } from "./_components/GradeSubmissionRow";
import { MarkerAssignmentPanel } from "./_components/MarkerAssignmentPanel";
import { PublishResultsButton } from "./_components/PublishResultsButton";
import { api } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { examTypeLabel, formatExamWindow, getExamStatus } from "@/lib/exam";
import type {
  AcademicStaff,
  ApiList,
  ApiSuccess,
  ExamDetail,
  ExamMarkerAssignment,
  ExamSubmission,
} from "@/lib/types";

export default async function GradeExamPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { examId } = await params;

  const user = await requireUser(cookie);
  if (user.role === "STUDENT") redirect("/exams");

  const backLink = (
    <Link
      href="/submissions"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All submissions
    </Link>
  );

  let exam: ExamDetail;
  try {
    exam = (await api.get<ApiSuccess<ExamDetail>>(`/exams/${examId}`, { cookie })).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  // Markers not assigned to this exam get 403 — show a friendly gate.
  let submissions: ExamSubmission[] | null = null;
  let gateError: string | null = null;
  try {
    submissions = (
      await api.get<ApiList<ExamSubmission>>(`/submissions/exam/${examId}`, { cookie })
    ).data;
  } catch (e) {
    if (e instanceof ApiError && (e.code === "MARKER_NOT_ASSIGNED" || e.status === 403)) {
      gateError = "You're not assigned to mark this exam.";
    } else {
      throw e;
    }
  }

  const status = getExamStatus(exam);
  const canPublish = user.role === "SUPER_ADMIN" || user.role === "TEACHER";
  const graded = submissions?.filter((s) => s.marks !== null).length ?? 0;
  const total = submissions?.length ?? 0;
  const [availableMarkers, assignedMarkers] = canPublish
    ? await Promise.all([
        api
          .get<ApiList<AcademicStaff>>("/users/academic-staff?role=MARKER", { cookie })
          .then((response) => response.data)
          .catch(() => [] as AcademicStaff[]),
        api
          .get<ApiList<ExamMarkerAssignment>>(`/exams/${examId}/markers`, { cookie })
          .then((response) => response.data)
          .catch(() => [] as ExamMarkerAssignment[]),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-3xl">
      {backLink}

      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 font-normal">
            <FileText className="size-3" aria-hidden />
            {examTypeLabel(exam.type)}
          </Badge>
          <ExamStatusBadge status={status} />
          {exam.isPublished && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              Published
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{exam.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatExamWindow(exam.startTime, exam.endTime)} · {exam.totalMarks} marks
        </p>
      </header>

      {gateError ? (
        <ExamNotice icon={Ban} title="Not assigned" message={gateError} />
      ) : (
        <>
          {canPublish && (
            <MarkerAssignmentPanel
              examId={examId}
              markers={availableMarkers}
              assignments={assignedMarkers}
            />
          )}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-5 py-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{graded}</span> of{" "}
              <span className="font-medium text-foreground">{total}</span> graded
            </p>
            {canPublish && !exam.isPublished && (
              <PublishResultsButton
                examId={exam.id}
                disabled={status !== "ended"}
                disabledHint={status !== "ended" ? "The exam must end before publishing." : undefined}
              />
            )}
          </div>

          {total === 0 ? (
            <ExamNotice
              icon={Info}
              title="No submissions yet"
              message="Submissions will appear here as students complete the exam."
            />
          ) : (
            <ul className="space-y-3">
              {submissions!.map((submission) => (
                <li key={submission.id}>
                  <GradeSubmissionRow
                    submission={submission}
                    examType={exam.type}
                    totalMarks={exam.totalMarks}
                    mcqPayload={exam.mcqPayload}
                    published={exam.isPublished}
                    viewerRole={user.role}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
