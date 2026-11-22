import { api, ApiError } from "@/lib/api";
import { MAX_EXAM_PDF_BYTES, safePdfName } from "@/lib/exam";
import type { WrittenChannel, WrittenPart } from "@/lib/exam-draft";
import type { ApiSuccess, McqAnswers, StartSubmissionResult, WrittenAnswers } from "@/lib/types";

export interface AnswersToSend {
  examId: string;
  requiresMcq: boolean;
  requiresWritten: boolean;
  mcq: McqAnswers;
  channel: WrittenChannel;
  parts: WrittenPart[];
  file: File | null;
}

/** Starts the submission and, for a PDF, uploads it and confirms it landed. Throws an `Error` with a message fit to show. */
export async function sendAnswers({ examId, requiresMcq, requiresWritten, mcq, channel, parts, file }: AnswersToSend): Promise<void> {
  const body: Record<string, unknown> = { examId };
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
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}
