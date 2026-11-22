/**
 * Exam display helpers shared by the `/exams` list and `/exams/[examId]` detail.
 * Status is derived from the exam window; times render in Asia/Colombo.
 *
 * Note: status computed here is for **display only**. The backend is
 * authoritative on whether a submission is accepted (server-time gate).
 */
import type { Exam, ExamType, MyAudience, MySubmission } from "@/lib/types";

export type ExamStatus = "upcoming" | "active" | "ended";

export function getExamStatus(
  exam: { startTime: string; endTime: string },
  now: number = Date.now(),
): ExamStatus {
  const start = new Date(exam.startTime).getTime();
  const end = new Date(exam.endTime).getTime();
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "active";
}

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  MCQ: "MCQ",
  WRITTEN: "Written",
  HYBRID: "Hybrid",
  INCLASS: "In-class",
};

export function examTypeLabel(type: ExamType): string {
  return EXAM_TYPE_LABELS[type];
}

/** Shared with the backend's EXAM_PDF_MAX_SIZE_BYTES / ANSWER_PDF_MAX_SIZE_BYTES (50 MB). */
export const MAX_EXAM_PDF_BYTES = 50 * 1024 * 1024;

/** Coerce a chosen filename into the backend's `^[A-Za-z0-9._-]+\.pdf$` shape. */
export function safePdfName(name: string): string {
  const base = name.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "file";
  return `${base}.pdf`;
}

const dayFmt = new Intl.DateTimeFormat("en-LK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Asia/Colombo",
});
const timeFmt = new Intl.DateTimeFormat("en-LK", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Colombo",
});
const colomboDayKey = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Colombo",
});

/** e.g. "Wed, 19 May · 9:00 AM – 10:00 AM" (same day) or full start/end otherwise. */
export function formatExamWindow(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const sameDay = colomboDayKey.format(start) === colomboDayKey.format(end);
  if (sameDay) {
    return `${dayFmt.format(start)} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
  }
  return `${dayFmt.format(start)} ${timeFmt.format(start)} → ${dayFmt.format(end)} ${timeFmt.format(end)}`;
}

/** Format a millisecond remaining span as "H:MM:SS" / "MM:SS" for a countdown. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** A PDF attempt whose file never landed. The server lets the student start again on the same row. */
export function isUnfinishedUpload(sub: Pick<MySubmission, "status" | "answerPdfUrl">): boolean {
  return sub.status === "UPLOADING" && !sub.answerPdfUrl;
}

export type StudentExamView = "result" | "hall" | "upcoming" | "sit" | "not-received" | "closed";

/** What a student sees on a sittable exam, from their audience, their submission and the window. */
export function studentExamView(
  exam: Pick<Exam, "myAudience">,
  status: ExamStatus,
  submission?: Pick<MySubmission, "status" | "answerPdfUrl">,
): StudentExamView {
  if (submission && !isUnfinishedUpload(submission)) return "result";
  if (exam.myAudience?.deliveryMode === "PHYSICAL") return "hall";
  if (status === "upcoming") return "upcoming";
  if (status === "active") return "sit";
  return submission ? "not-received" : "closed";
}

export function hallMessage(audience: MyAudience): string {
  const where = audience.instituteName ? ` at ${audience.instituteName}` : "";
  return `Your paper is sat in the hall${where}. There is no online submission.`;
}
