"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { MAX_EXAM_PDF_BYTES, examTypeLabel, safePdfName } from "@/lib/exam";
import { McqBuilder, emptyQuestion, type BuilderQuestion } from "./McqBuilder";
import type { ApiSuccess, Course, Exam, ExamPaperUploadResult, ExamType } from "@/lib/types";

const TYPES: ExamType[] = ["MCQ", "WRITTEN", "HYBRID", "INCLASS"];
const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function ExamForm({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [type, setType] = useState<ExamType>("MCQ");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [allowTypedAnswers, setAllowTyped] = useState(true);
  const [allowPdfUpload, setAllowPdf] = useState(true);
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<BuilderQuestion[]>([emptyQuestion()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once POST /exams succeeds. A paper-upload failure afterward is
  // retried against this id instead of re-submitting (and duplicating) the exam.
  const [examId, setExamId] = useState<string | null>(null);

  const requiresMcq = type === "MCQ" || type === "HYBRID";
  const requiresWritten = type === "WRITTEN" || type === "HYBRID";
  const mcqSum = useMemo(
    () => questions.reduce((n, q) => n + (Number(q.marks) || 0), 0),
    [questions],
  );

  const validate = (): string | null => {
    if (title.trim().length < 3) return "Title must be at least 3 characters.";
    if (!courseId) return "Choose a course.";
    if (!startTime || !endTime) return "Set the start and end times.";
    if (new Date(startTime) >= new Date(endTime)) return "End time must be after the start time.";
    if (!(Number(totalMarks) > 0)) return "Total marks must be greater than zero.";
    if (requiresWritten && !allowTypedAnswers && !allowPdfUpload)
      return "Enable at least one written answer channel.";
    if (requiresMcq) {
      for (const [i, q] of questions.entries()) {
        if (!q.text.trim()) return `Question ${i + 1} needs text.`;
        if (!(Number(q.marks) >= 1)) return `Question ${i + 1} needs marks.`;
        const opts = q.options.filter((o) => o.text.trim());
        if (opts.length < 2) return `Question ${i + 1} needs at least two options.`;
        if (!q.options.some((o) => o.correct)) return `Mark a correct answer for question ${i + 1}.`;
      }
    }
    return null;
  };

  /**
   * Uploads the paper PDF direct-to-R2 — same pattern as the student answer-PDF
   * channel in ExamSit.tsx: the backend only hands back a presigned PUT URL, the
   * file itself never passes through our server.
   */
  const uploadPaper = async (id: string, file: File): Promise<void> => {
    if (file.size > MAX_EXAM_PDF_BYTES) throw new Error("Paper PDF exceeds the 50 MB limit.");
    const res = await api.post<ApiSuccess<ExamPaperUploadResult>>(`/exams/${id}/upload-url`, {
      fileName: safePdfName(file.name),
      contentType: "application/pdf",
      fileSizeBytes: file.size,
    });
    const put = await fetch(res.data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    if (!put.ok) throw new Error("Paper upload failed. Please check your connection and try again.");
  };

  const submit = async (): Promise<void> => {
    setError(null);

    // Retry mode: the exam already exists, only the paper upload failed last time.
    if (examId) {
      if (!paperFile) {
        router.push("/exams");
        router.refresh();
        return;
      }
      setSubmitting(true);
      try {
        await uploadPaper(examId, paperFile);
        router.push("/exams");
        router.refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Upload failed.");
        setSubmitting(false);
      }
      return;
    }

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        type,
        courseId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        totalMarks: Number(totalMarks),
      };
      if (requiresWritten) {
        body.allowTypedAnswers = allowTypedAnswers;
        body.allowPdfUpload = allowPdfUpload;
      }
      if (requiresMcq) {
        body.mcqPayload = {
          questions: questions.map((q, i) => ({
            id: `q${i + 1}`,
            text: q.text.trim(),
            order: i + 1,
            marks: Number(q.marks),
            options: q.options
              .filter((o) => o.text.trim())
              .map((o, j) => ({ id: `o${j + 1}`, text: o.text.trim(), isCorrect: o.correct })),
          })),
        };
      }
      const created = await api.post<ApiSuccess<Exam>>("/exams", body);

      if (requiresWritten && paperFile) {
        setExamId(created.data.id); // exam now exists — further retries reuse it, never duplicate
        await uploadPaper(created.data.id, paperFile);
      }

      router.push("/exams");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not create the exam. Try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium text-foreground">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. Unit 3 Quiz" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="course" className="text-sm font-medium text-foreground">Course</label>
          <select id="course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className={field}>
            {courses.length === 0 && <option value="">No courses available</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="type" className="text-sm font-medium text-foreground">Type</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value as ExamType)} className={field}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{examTypeLabel(t)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="start" className="text-sm font-medium text-foreground">Opens</label>
          <input id="start" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="end" className="text-sm font-medium text-foreground">Closes</label>
          <input id="end" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="marks" className="text-sm font-medium text-foreground">Total marks</label>
          <input id="marks" type="number" min={1} value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} className={field} />
          {requiresMcq && <p className="text-xs text-muted-foreground">MCQ questions total {mcqSum}.</p>}
        </div>
      </div>

      {requiresWritten && (
        <div className="space-y-2 rounded-2xl border border-border bg-muted/20 p-4">
          <p className="text-sm font-medium text-foreground">Written answer channels</p>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={allowTypedAnswers} onChange={(e) => setAllowTyped(e.target.checked)} className="size-4 accent-foreground" />
            Allow typed answers
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={allowPdfUpload} onChange={(e) => setAllowPdf(e.target.checked)} className="size-4 accent-foreground" />
            Allow PDF upload
          </label>
        </div>
      )}

      {requiresWritten && (
        <div className="space-y-1.5">
          <label htmlFor="paper" className="text-sm font-medium text-foreground">
            Question paper (PDF) <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="paper"
            type="file"
            accept="application/pdf"
            disabled={submitting || !!examId}
            onChange={(e) => setPaperFile(e.target.files?.[0] ?? null)}
            className={`${field} file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground`}
          />
          <p className="text-xs text-muted-foreground">
            Uploads directly to Cloudflare R2 — the server never sees the file.
          </p>
        </div>
      )}

      {requiresMcq && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Questions</p>
          <McqBuilder questions={questions} onChange={setQuestions} disabled={submitting} />
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {examId ? "Exam created — but " : ""}
          {error}
        </p>
      )}

      <Button onClick={submit} disabled={submitting || courses.length === 0} size="lg">
        {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        {examId ? "Retry paper upload" : "Create exam"}
      </Button>
    </div>
  );
}
