"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Info, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountdownTimer } from "./CountdownTimer";
import { McqQuestionList } from "./McqQuestionList";
import {
  WrittenAnswerPanel,
  type WrittenChannel,
  type WrittenPart,
} from "./WrittenAnswerPanel";
import { api, ApiError } from "@/lib/api";
import { MAX_EXAM_PDF_BYTES, safePdfName } from "@/lib/exam";
import type {
  ApiSuccess,
  ExamDetail,
  McqAnswers,
  MySubmission,
  StartSubmissionResult,
  WrittenAnswers,
} from "@/lib/types";

/** `resume` is the student's own unfinished upload: starting again reuses that row on the server. */
export function ExamSit({ exam, resume }: { exam: ExamDetail; resume?: MySubmission }) {
  const router = useRouter();
  const requiresMcq = exam.type === "MCQ" || exam.type === "HYBRID";
  const requiresWritten = exam.type === "WRITTEN" || exam.type === "HYBRID";
  const storageKey = `exam:${exam.id}:answers`;

  const [mcq, setMcq] = useState<McqAnswers>(resume?.answers ?? {});
  const [channel, setChannel] = useState<WrittenChannel>(
    exam.allowTypedAnswers ? "typed" : "pdf",
  );
  const [parts, setParts] = useState<WrittenPart[]>([{ key: "part-1", text: "" }]);
  const [file, setFile] = useState<File | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Restore MCQ answers on mount + sync across tabs (prevents the multi-tab
  // overwrite bug for exams — architecture §5.1).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      // Hydrate from the last autosave. localStorage is client-only, so this
      // can't move to a lazy initializer without an SSR hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setMcq(JSON.parse(saved) as McqAnswers);
    } catch {
      /* ignore corrupt cache */
    }
    const bc = new BroadcastChannel(storageKey);
    bc.onmessage = (e: MessageEvent<McqAnswers>) => setMcq(e.data);
    channelRef.current = bc;
    return () => bc.close();
  }, [storageKey]);

  const persist = useCallback(
    (next: McqAnswers) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage full / unavailable — non-fatal */
      }
      channelRef.current?.postMessage(next);
    },
    [storageKey],
  );

  const toggleOption = useCallback(
    (questionId: string, optionId: string) => {
      setMcq((prev) => {
        const current = prev[questionId] ?? [];
        const nextForQuestion = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        const next = { ...prev };
        // Drop empty arrays — the API rejects a question with no selections.
        if (nextForQuestion.length === 0) delete next[questionId];
        else next[questionId] = nextForQuestion;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { examId: exam.id };
      if (requiresMcq) body.answers = mcq;

      let pdfToUpload: File | null = null;
      if (requiresWritten) {
        if (channel === "pdf") {
          if (!file) throw new Error("Choose a PDF answer file to upload.");
          if (file.size > MAX_EXAM_PDF_BYTES) throw new Error("PDF exceeds the 50 MB limit.");
          pdfToUpload = file;
          body.fileName = safePdfName(file.name);
          body.contentType = "application/pdf";
          body.fileSizeBytes = file.size;
        } else {
          const written: WrittenAnswers = {};
          for (const p of parts) if (p.text.trim()) written[p.key] = p.text.trim();
          if (Object.keys(written).length === 0) {
            throw new Error("Type your written answers before submitting.");
          }
          body.writtenAnswers = written;
        }
      }

      const res = await api.post<ApiSuccess<StartSubmissionResult>>("/submissions", body);

      // PDF channel: upload directly to R2, then finalize the submission.
      if (pdfToUpload && res.data.uploadUrl) {
        const put = await fetch(res.data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: pdfToUpload,
        });
        if (!put.ok) throw new Error("Upload failed. Please check your connection and try again.");
        // `complete` HeadObject-verifies the file landed and only then persists
        // answerPdfUrl — so a blocked PUT can't leave a submitted-but-empty answer.
        await api.patch(`/submissions/${res.data.submission.id}/complete`, {
          key: res.data.uploadKey,
        });
      }

      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      router.refresh(); // server re-renders into the "submitted" / results view
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
  };

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
        <CountdownTimer target={exam.endTime} onExpire={() => setTimeUp(true)} className="text-lg" />
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
            setParts((prev) => [...prev, { key: `part-${prev.length + 1}`, text: "" }])
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

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button onClick={submit} disabled={disabled} size="lg" className="w-full sm:w-auto">
        {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Submit exam
      </Button>
      <p className="text-xs text-muted-foreground">
        You can submit once. Review your answers before submitting.
      </p>
    </div>
  );
}
