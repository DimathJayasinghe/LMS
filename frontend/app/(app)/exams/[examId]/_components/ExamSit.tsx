"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Info, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountdownTimer } from "./CountdownTimer";
import { McqQuestionList } from "./McqQuestionList";
import { WrittenAnswerPanel } from "./WrittenAnswerPanel";
import { errorMessage, sendAnswers } from "./sendAnswers";
import { useAutoSubmit } from "./useAutoSubmit";
import { useMcqDraft } from "./useMcqDraft";
import { useWrittenDraft } from "./useWrittenDraft";
import { ApiError } from "@/lib/api";
import { clearDrafts, examDraftKeys, hasUnsentContent, nextPartKey } from "@/lib/exam-draft";
import { useLeaveWarning } from "@/lib/use-leave-warning";
import { useServerOffset } from "@/lib/use-server-offset";
import type { ExamDetail, MySubmission } from "@/lib/types";

/** Used when the server sent no setting, matching the server default. */
const DEFAULT_AUTO_SUBMIT_LEAD_SECONDS = 15;

/** `resume` is the student's own unfinished upload: starting again reuses that row on the server. */
export function ExamSit({ exam, resume, userId }: { exam: ExamDetail; resume?: MySubmission; userId: string }) {
  const router = useRouter();
  const requiresMcq = exam.type === "MCQ" || exam.type === "HYBRID";
  const requiresWritten = exam.type === "WRITTEN" || exam.type === "HYBRID";
  const { mcq: mcqKey, written: writtenKey } = examDraftKeys(userId, exam.id);

  const { mcq, toggleOption } = useMcqDraft(mcqKey, resume?.answers ?? {});
  const { channel, setChannel, parts, setParts, hydrated } = useWrittenDraft({
    storageKey: writtenKey,
    allowTyped: exam.allowTypedAnswers,
    allowPdf: exam.allowPdfUpload,
  });
  const [file, setFile] = useState<File | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<"manual" | "auto" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const offsetMs = useServerOffset();

  const submit = async (automatic: boolean): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await sendAnswers({ examId: exam.id, requiresMcq, requiresWritten, mcq, channel, parts, file });

      clearDrafts(mcqKey, writtenKey);
      setSent(automatic ? "auto" : "manual");
      // An automatic submit leaves the page as it is, so a student still typing is not thrown onto the result view.
      if (!automatic) router.refresh(); // server re-renders into the "submitted" / results view
    } catch (e) {
      // Another tab of the same exam sent first, and it held the same synced answers: that is a submit, not a failure.
      if (automatic && e instanceof ApiError && e.code === "ALREADY_SUBMITTED") {
        clearDrafts(mcqKey, writtenKey);
        setSent("auto");
        return;
      }
      setError(errorMessage(e));
      setSubmitting(false);
      inFlight.current = false;
    }
  };

  const unsent = hasUnsentContent({ requiresMcq, requiresWritten, mcq, channel, parts, file });
  useLeaveWarning(unsent && !sent);
  useAutoSubmit({
    endTime: exam.endTime,
    leadSeconds: exam.sitting?.autoSubmitLeadSeconds ?? DEFAULT_AUTO_SUBMIT_LEAD_SECONDS,
    offsetMs,
    active: hydrated && !timeUp && !sent,
    onFire: () => {
      if (inFlight.current) return true;
      if (!unsent) return false;
      void submit(true);
      return true;
    },
  });
  const handleExpire = useCallback(() => setTimeUp(true), []);
  // The countdown reads the device clock; moving its target by the measured offset makes it show server time.
  const countdownTarget = new Date(new Date(exam.endTime).getTime() - offsetMs).toISOString();

  const disabled = submitting || timeUp;

  return (
    <div className="space-y-6">
      {resume && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-medium">Your earlier upload did not finish</strong>
            <br />
            Choose your PDF again or type your answers, then submit.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-5 py-3">
        <span className="text-sm text-muted-foreground">Time remaining</span>
        <CountdownTimer target={countdownTarget} onExpire={handleExpire} className="text-lg" />
      </div>

      {requiresMcq && exam.mcqPayload && (
        <McqQuestionList
          questions={exam.mcqPayload.questions}
          value={mcq}
          onToggle={toggleOption}
          disabled={disabled}
        />
      )}

      {requiresWritten && (
        <WrittenAnswerPanel
          allowTyped={exam.allowTypedAnswers}
          allowPdf={exam.allowPdfUpload}
          paperPdfUrl={exam.paperPdfUrl}
          channel={channel}
          onChannelChange={setChannel}
          parts={parts}
          onPartChange={(key, text) =>
            setParts((prev) => prev.map((p) => (p.key === key ? { ...p, text } : p)))
          }
          onAddPart={() =>
            setParts((prev) => [...prev, { key: nextPartKey(prev), text: "" }])
          }
          onRemovePart={(key) => setParts((prev) => prev.filter((p) => p.key !== key))}
          file={file}
          onFileChange={setFile}
          disabled={disabled}
        />
      )}

      {timeUp && (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          Time is up. The submission window has closed.
        </p>
      )}

      {sent === "auto" && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3 text-sm text-foreground"
        >
          <span className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-medium">Submitted automatically</strong>
              <br />
              Your answers were sent just before time ran out.
            </span>
          </span>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            Continue
          </Button>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button onClick={() => submit(false)} disabled={disabled} size="lg" className="w-full sm:w-auto">
        {submitting && !sent ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Submit exam
      </Button>
      <p className="text-xs text-muted-foreground">
        You can submit once. Review your answers before submitting.
      </p>
    </div>
  );
}
