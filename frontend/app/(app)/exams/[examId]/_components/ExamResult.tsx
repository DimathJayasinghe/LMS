import { AlertCircle, CheckCircle2, Clock3, FileText } from "lucide-react";
import { isUnfinishedUpload } from "@/lib/exam";
import type { MySubmission } from "@/lib/types";

interface ExamResultProps {
  submission: MySubmission;
}

const fmt = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

/** The post-submission view: "awaiting results" until published, then the score. */
export function ExamResult({ submission }: ExamResultProps) {
  const { published, marks, feedback, exam } = submission;
  const pct =
    published && marks != null && exam.totalMarks > 0
      ? Math.round((marks / exam.totalMarks) * 100)
      : null;
  const writtenAnswers = submission.writtenAnswers
    ? Object.entries(submission.writtenAnswers)
    : [];

  if (isUnfinishedUpload(submission)) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="font-medium text-foreground">Your answer file was not received</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The upload did not finish before the exam closed. Contact your teacher.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {published && marks != null ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Your result
          </p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-foreground">
            {marks}
            <span className="text-xl font-normal text-muted-foreground"> / {exam.totalMarks}</span>
          </p>
          {pct != null && <p className="mt-1 text-sm text-muted-foreground">{pct}%</p>}
          {submission.gradedAt && (
            <p className="mt-3 text-xs text-muted-foreground">
              Graded {fmt.format(new Date(submission.gradedAt))}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-6">
          {published ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <Clock3 className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          )}
          <div>
            <p className="font-medium text-foreground">
              {published ? "Submission received" : "Submitted — awaiting results"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You submitted on {fmt.format(new Date(submission.submittedAt))}. Results will appear
              here once your teacher publishes them.
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Feedback
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{feedback}</p>
        </section>
      )}

      {submission.answerPdfUrl && (
        <a
          href={submission.answerPdfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <FileText className="size-4" aria-hidden />
          View your submitted PDF
        </a>
      )}

      {writtenAnswers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Your written answers
          </h2>
          {writtenAnswers.map(([key, text], index) => (
            <div key={key} className="rounded-2xl border border-border bg-card p-5">
              <p className="mb-1 text-sm font-medium text-foreground">Answer {index + 1}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {text}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
