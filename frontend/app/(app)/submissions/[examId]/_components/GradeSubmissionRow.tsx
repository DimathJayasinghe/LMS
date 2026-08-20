"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, ExamSubmission, ExamType, McqPayload, Role } from "@/lib/types";

interface Props {
  submission: ExamSubmission;
  examType: ExamType;
  totalMarks: number;
  mcqPayload: McqPayload | null;
  published: boolean;
  viewerRole: Role;
}

export function GradeSubmissionRow({
  submission,
  examType,
  totalMarks,
  mcqPayload,
  published,
  viewerRole,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState(submission.marks?.toString() ?? "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const incomplete = submission.status !== "COMPLETED";
  const graded = submission.marks !== null;
  const isMarker = viewerRole === "MARKER";
  const canCorrect = published && (viewerRole === "TEACHER" || viewerRole === "SUPER_ADMIN");

  const save = async (): Promise<void> => {
    const value = Number(marks);
    if (!Number.isFinite(value) || value < 0 || value > totalMarks) {
      setError(`Marks must be between 0 and ${totalMarks}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch<ApiSuccess<unknown>>(
        `/submissions/${submission.id}/marks`,
        { marks: value, feedback: feedback.trim() || undefined },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save marks. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const correct = async (): Promise<void> => {
    const value = Number(marks);
    if (!Number.isFinite(value) || value < 0 || value > totalMarks) {
      setError(`Marks must be between 0 and ${totalMarks}.`);
      return;
    }
    if (reason.trim().length < 5) {
      setError("Enter a correction reason of at least 5 characters for the audit log.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch<ApiSuccess<unknown>>(
        `/submissions/${submission.id}/result-correction`,
        {
          marks: value,
          feedback: feedback.trim() || null,
          reason: reason.trim(),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setReason("");
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the correction. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {submission.user.name}
          </span>
          <span className="text-xs text-muted-foreground">Index #{submission.user.indexNumber}</span>
        </span>
        <span className="flex items-center gap-2">
          {incomplete ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
              Uploading
            </Badge>
          ) : graded ? (
            <span className="text-sm font-semibold text-foreground">
              {submission.marks}
              <span className="text-muted-foreground"> / {totalMarks}</span>
            </span>
          ) : (
            <Badge variant="outline">Not graded</Badge>
          )}
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {/* Answer context */}
          {submission.answerPdfUrl && (
            <a
              href={submission.answerPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <FileText className="size-4" aria-hidden />
              View answer PDF
            </a>
          )}

          {submission.writtenAnswers && Object.keys(submission.writtenAnswers).length > 0 && (
            <div className="space-y-2">
              {Object.entries(submission.writtenAnswers).map(([key, text]) => (
                <div key={key} className="rounded-lg bg-muted/40 p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {key}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
                </div>
              ))}
            </div>
          )}

          {examType !== "WRITTEN" && submission.answers && mcqPayload && (
            <ul className="space-y-2">
              {mcqPayload.questions.map((q) => {
                const picked = submission.answers?.[q.id] ?? [];
                return (
                  <li key={q.id} className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="mb-1.5 font-medium text-foreground">{q.text}</p>
                    <ul className="space-y-1">
                      {q.options.map((o) => {
                        const chosen = picked.includes(o.id);
                        return (
                          <li key={o.id} className="flex items-center gap-1.5 text-muted-foreground">
                            {o.isCorrect ? (
                              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                            ) : chosen ? (
                              <X className="size-3.5 text-red-500" aria-hidden />
                            ) : (
                              <span className="size-3.5" />
                            )}
                            <span className={chosen ? "font-medium text-foreground" : ""}>{o.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Grade form */}
          {incomplete ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              This submission is still uploading and can&apos;t be graded yet.
            </p>
          ) : isMarker && !published ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label htmlFor={`marks-${submission.id}`} className="text-sm font-medium text-foreground">
                  Marks
                </label>
                <input
                  id={`marks-${submission.id}`}
                  type="number"
                  min={0}
                  max={totalMarks}
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">/ {totalMarks}</span>
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Feedback (optional)"
                rows={2}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {error && (
                <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
                  <AlertCircle className="size-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                  Save marks
                </Button>
                {savedAt && !saving && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>
                )}
              </div>
            </div>
          ) : canCorrect ? (
            <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm text-muted-foreground">
                This result is already visible to the student. Corrections are restricted to the course teacher or a super admin and are permanently audited.
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor={`marks-${submission.id}`} className="text-sm font-medium text-foreground">
                  Corrected marks
                </label>
                <input
                  id={`marks-${submission.id}`}
                  type="number"
                  min={0}
                  max={totalMarks}
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">/ {totalMarks}</span>
              </div>
              <label htmlFor={`feedback-${submission.id}`} className="block text-sm font-medium text-foreground">
                Feedback
              </label>
              <textarea
                id={`feedback-${submission.id}`}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Student feedback (optional)"
                rows={2}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <label htmlFor={`reason-${submission.id}`} className="block text-sm font-medium text-foreground">
                Correction reason <span className="text-destructive" aria-hidden>*</span>
              </label>
              <textarea
                id={`reason-${submission.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this published result being changed?"
                rows={2}
                required
                minLength={5}
                maxLength={500}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {error && (
                <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
                  <AlertCircle className="size-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={correct} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                  Record correction
                </Button>
                {savedAt && !saving && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Correction recorded</span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              {published
                ? "Published results are locked for markers. Contact the course teacher if a correction is needed."
                : "Assigned markers enter marks here. Teachers can review submissions and publish the completed results."}
              {graded && (
                <span className="mt-1 block text-foreground">
                  Current result: {submission.marks} / {totalMarks}
                  {submission.feedback ? ` · ${submission.feedback}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
