import { guard401, requireUser } from "@/lib/session";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { CheckCircle2, ClipboardCheck, FileText } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { Badge } from "@/components/ui/badge";
import { ExamStatusBadge } from "@/components/features/ExamStatusBadge";
import { api } from "@/lib/api-server";
import { examTypeLabel, formatExamWindow, getExamStatus } from "@/lib/exam";
import type { ApiList, Course, Exam } from "@/lib/types";

export const metadata = { title: "Submissions · LMS" };

export default async function SubmissionsPage() {
  const cookie = (await cookies()).toString();

  const user = await requireUser(cookie);
  // Students grade nothing — send them to their own exams view.
  if (user.role === "STUDENT") redirect("/exams");

  const [exams, courses] = await Promise.all([
    guard401(api
      .get<ApiList<Exam>>("/exams", { cookie }))
      .then((r) => r.data)
      .catch((error) => { unstable_rethrow(error); return [] as Exam[]; }),
    guard401(api
      .get<ApiList<Course>>("/classes", { cookie }))
      .then((r) => r.data)
      .catch((error) => { unstable_rethrow(error); return [] as Course[]; }),
  ]);

  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  // Upcoming exams have no submissions yet — only show active/ended for grading.
  const gradable = exams
    .filter((e) => getExamStatus(e) !== "upcoming")
    .sort((a, b) => (a.endTime < b.endTime ? 1 : -1));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Submissions" description="Grade student submissions and publish results." />

      {gradable.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No exams are ready for grading yet.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gradable.map((exam) => {
            const status = getExamStatus(exam);
            return (
              <li key={exam.id}>
                <Link
                  href={`/submissions/${exam.id}`}
                  className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <FileText className="size-3" aria-hidden />
                      {examTypeLabel(exam.type)}
                    </Badge>
                    <ExamStatusBadge status={status} />
                    {exam.isPublished && (
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" aria-hidden />
                        Published
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1">
                    <h2 className="font-semibold text-foreground">{exam.title}</h2>
                    {courseName.has(exam.courseId) && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {courseName.get(exam.courseId)}
                      </p>
                    )}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ClipboardCheck className="size-3.5" aria-hidden />
                    {formatExamWindow(exam.startTime, exam.endTime)} · {exam.totalMarks} marks
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
