/**
 * Shared API & domain types.
 *
 * These mirror the backend contracts in `context/api_endpoints/*.endpoints.md`.
 * Keep them in sync when an endpoint's shape changes.
 */

// ── Roles ────────────────────────────────────────────────────────────────────
export type Role =
  | "SUPER_ADMIN"
  | "TEACHER"
  | "ADMIN"
  | "MARKER"
  | "STUDENT";

// ── Response envelopes ───────────────────────────────────────────────────────
/** Standard success envelope for a single resource. */
export interface ApiSuccess<T> {
  status: "success";
  data: T;
  message?: string;
}

/** Standard success envelope for a paginated / counted list. */
export interface ApiList<T> {
  status: "success";
  data: T[];
  count: number;
  page?: number;
  limit?: number;
}

/** A single field-level validation error (from the 400 validation shape). */
export interface FieldError {
  field: string;
  message: string;
}

// ── User ─────────────────────────────────────────────────────────────────────
/** Current-user shape returned by `/auth/me`, `/users/:id`, etc. */
export interface User {
  id: string;
  indexNumber: number;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  nic?: string | null;
  barcode?: string | null;
  /** Account-setup gate: NIC upload + barcode completed. */
  setupCompleted?: boolean;
  nicFrontUrl?: string | null;
  nicBackUrl?: string | null;
  deletedAt?: string | null;
  createdAt: string;
}

// ── Academic hierarchy ───────────────────────────────────────────────────────
export interface Subject {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  name: string;
  year?: number | null;
  subjectId: string;
  teacherId: string;
  bannerUrl?: string | null;
  backdropUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClassType = "ONLINE" | "PHYSICAL" | null;

export interface TimetableSlot {
  id: string;
  title?: string | null;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:mm", Asia/Colombo
  durationMinutes: number;
  classType: ClassType;
  zoomLink?: string | null;
  isActive: boolean;
  courseId: string;
  instituteId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Institute {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Exams & submissions ──────────────────────────────────────────────────────
export type ExamType = "MCQ" | "WRITTEN" | "HYBRID" | "INCLASS";
export type SubmissionStatus = "UPLOADING" | "COMPLETED";

export interface Exam {
  id: string;
  title: string;
  type: ExamType;
  totalMarks: number;
  allowTypedAnswers: boolean;
  allowPdfUpload: boolean;
  courseId: string;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Payments & attendance ────────────────────────────────────────────────────
export type PaymentMethod = "ONLINE" | "ENTRANCE" | "BULK" | "MANUAL";
export type AttendanceSource = "QR" | "BARCODE" | "ZOOM_WEBHOOK" | "MANUAL";
