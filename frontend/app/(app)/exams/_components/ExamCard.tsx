import Link from "next/link";
import { CheckCircle2, Clock, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExamStatusBadge } from "@/components/features/ExamStatusBadge";
import { examTypeLabel, formatExamWindow, getExamStatus } from "@/lib/exam";
import type { Exam } from "@/lib/types";

/** The viewing student's relationship to this exam, for the corner hint. */
export type ExamCardState = "none" | "submitted" | "result";

interface ExamCardProps {
  exam: Exam;
  /** Resolved course name (exams carry only `courseId`). */
  courseName?: string;
  /** Student-only submission state; omitted for staff. */
  state?: ExamCardState;
}

export default function ExamCard({ exam, courseName, state = "none" }: ExamCardProps) {
  const status = getExamStatus(exam);

  return (
    <Link
      href={`/exams/${exam.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground transition hover:border-foreground/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 font-normal">
            <FileText className="size-3" aria-hidden />
            {examTypeLabel(exam.type)}
          </Badge>
          <ExamStatusBadge status={status} />
        </div>
        {state === "result" ? (
          <Badge
            variant="outline"
            className="border-transparent bg-blue-500/10 text-blue-600 dark:text-blue-400"
          >
            Results out
          </Badge>
        ) : state === "submitted" ? (
          <Badge variant="outline" className="gap-1 border-transparent text-muted-foreground">
            <CheckCircle2 className="size-3" aria-hidden />
            Submitted
          </Badge>
        ) : null}
      </div>

      <div>
        <h3 className="font-medium text-foreground">{exam.title}</h3>
        {courseName && <p className="text-sm text-muted-foreground">{courseName}</p>}
      </div>

      <p className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" aria-hidden />
        {formatExamWindow(exam.startTime, exam.endTime)}
        <span aria-hidden>·</span>
        {exam.totalMarks} marks
      </p>
    </Link>
  );
}
