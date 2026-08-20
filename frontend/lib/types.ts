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
  address?: string | null;
  city?: string | null;
  barcode?: string | null;
  /** Public CDN URL of the profile avatar (see profile.endpoints.md). */
  profileImage?: string | null;
  /** Account-setup gate: both NIC photos uploaded (see account-setup.endpoints.md). */
  setupCompleted?: boolean;
  /** Presence-only flags — never a raw R2 key or signed URL. */
  nicFrontUploaded?: boolean;
  nicBackUploaded?: boolean;
  /** Cooldown anchors for self email/password changes (see profile.endpoints.md). */
  emailChangedAt?: string | null;
  passwordChangedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
}

/** A student's own per-institute barcode (see account-setup.endpoints.md). */
export interface StudentBarcode {
  id: string;
  barcode: string;
  instituteId: string;
  institute: { id: string; name: string; code: string; city?: string | null };
  createdAt: string;
  updatedAt: string;
}

/** Signed direct-to-R2 NIC photo upload (POST /users/me/nic/upload-url). */
export interface NicUploadUrlResult {
  uploadUrl: string;
  key: string;
  expiresAt: string;
  /** Reflects the account *after* this write — true once both sides are on file. */
  setupCompleted: boolean;
}

/** Signed direct-to-public-R2 avatar upload (POST /users/me/avatar/upload-url). */
export interface AvatarUploadUrlResult {
  uploadUrl: string;
  key: string;
  expiresAt: string;
}

/** GET /users/resolve-barcode?code= result (see users.endpoints.md). */
export interface ResolvedBarcodeStudent {
  user: { id: string; name: string; indexNumber: number };
  instituteId: string | null;
  matchedBarcode: string;
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

export interface AcademicStaff {
  id: string;
  name: string;
  role: "TEACHER" | "MARKER";
}

export interface SubjectTeacherAssignment {
  teacherId: string;
  assignedAt: string;
  teacher: AcademicStaff;
}

export interface Course {
  id: string;
  name: string;
  year?: number | null;
  description?: string | null;
  /** Monthly fee — a decimal serialized as a string, e.g. "2500.00". */
  monthlyFee: string;
  isActive: boolean;
  subjectId: string;
  teacherId: string;
  bannerUrl?: string | null;
  bannerAlt?: string | null;
  backdropUrl?: string | null;
  backdropAlt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseAssetUploadUrlResult {
  uploadUrl: string;
  key: string;
  expiresAt: string;
  requiredWidth: number;
  requiredHeight: number;
  maxSizeBytes: number;
}

export type ClassType = "ONLINE" | "PHYSICAL" | null;

/** Enrollment / timetable mode. Unlike a session's `classType`, never null. */
export type EnrollmentMode = "ONLINE" | "PHYSICAL";

/** A dated occurrence of a course (see classes.endpoints.md). */
export interface ClassSession {
  id: string;
  title?: string | null;
  description?: string | null;
  classType: ClassType;
  date: string;
  durationMinutes: number;
  zoomLink?: string | null;
  zoomMeetingId?: string | null;
  courseId: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Course summary embedded in an Enrollment (see enrollments.endpoints.md). */
export interface EnrollmentCourse {
  id: string;
  name: string;
  year?: number | null;
  monthlyFee: string;
  bannerUrl?: string | null;
  isActive: boolean;
  subjectId: string;
  teacherId: string;
}

/** A student's link to a course in a given mode; gates content + payments. */
export interface Enrollment {
  id: string;
  classType: EnrollmentMode;
  isActive: boolean;
  userId: string;
  courseId: string;
  createdAt: string;
  updatedAt: string;
  course: EnrollmentCourse;
}

export interface LearningEnrollment extends Enrollment {
  learning: {
    newLessonCount: number;
    latestLessonAt: string | null;
    upcomingSessionCount: number;
    nextSessionAt: string | null;
    lastSeenAt: string;
  };
}

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
  code: string;
  city?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Exams & submissions ──────────────────────────────────────────────────────
export type ExamType = "MCQ" | "WRITTEN" | "HYBRID" | "INCLASS";
export type SubmissionStatus = "UPLOADING" | "COMPLETED";

/** An MCQ option. `isCorrect` is present only for privileged roles — stripped for students. */
export interface McqOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface McqQuestion {
  id: string;
  text: string;
  order: number;
  marks: number;
  options: McqOption[];
}

export interface McqPayload {
  questions: McqQuestion[];
}

/** Exam list item (see exams.endpoints.md). Times are ISO UTC strings. */
export interface Exam {
  id: string;
  title: string;
  type: ExamType;
  startTime: string;
  endTime: string;
  totalMarks: number;
  isPublished: boolean;
  allowTypedAnswers: boolean;
  allowPdfUpload: boolean;
  courseId: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Exam detail read. Adds the paper URL + MCQ payload. For a STUDENT the payload
 * is answer-stripped and only present inside the server-time exam window
 * (`null` otherwise); privileged roles always get the full payload.
 */
export interface ExamDetail extends Exam {
  paperPdfUrl: string | null;
  mcqPayload: McqPayload | null;
}

export interface ExamMarkerAssignment {
  markerId: string;
  assignedAt: string;
  marker: AcademicStaff;
}

/** Map of question ID → selected option IDs (MCQ). */
export type McqAnswers = Record<string, string[]>;
/** Map of question/part ID → typed answer text (written). */
export type WrittenAnswers = Record<string, string>;

/** A student's own submission (GET /submissions/mine). Marks are null until published. */
export interface MySubmission {
  id: string;
  status: SubmissionStatus;
  answers: McqAnswers | null;
  writtenAnswers: WrittenAnswers | null;
  answerPdfUrl: string | null;
  marks: number | null;
  feedback: string | null;
  published: boolean;
  examId: string;
  exam: {
    id: string;
    title: string;
    type: ExamType;
    totalMarks: number;
    isPublished: boolean;
  };
  submittedAt: string;
  gradedAt: string | null;
}

/** Response of POST /submissions. `uploadUrl` is present only for the PDF channel. */
export interface StartSubmissionResult {
  submission: {
    id: string;
    status: SubmissionStatus;
    answerPdfUrl: string | null;
    answers: McqAnswers | null;
    writtenAnswers: WrittenAnswers | null;
    marks: number | null;
    feedback: string | null;
    examId: string;
    userId: string;
    submittedAt: string;
    gradedAt: string | null;
    updatedAt: string;
  };
  uploadUrl?: string;
  uploadKey?: string;
  uploadExpiresAt?: string;
}

/** Response of POST /exams/:id/upload-url — a presigned R2 PUT for the exam's paper PDF. */
export interface ExamPaperUploadResult {
  uploadUrl: string;
  paperKey: string;
  expiresAt: string;
}

/** A submission as seen by a marker/teacher (GET /submissions/exam/:examId). */
export interface ExamSubmission {
  id: string;
  status: SubmissionStatus;
  answerPdfUrl: string | null;
  answers: McqAnswers | null;
  writtenAnswers: WrittenAnswers | null;
  marks: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
  user: { id: string; name: string; email: string; indexNumber: number };
}

/** Result of POST /submissions/exam/:examId/publish. */
export interface PublishResult {
  examId: string;
  examTitle: string;
  publishedAt: string;
  totalSubmissions: number;
  gradedSubmissions: number;
}

// ── Video recordings ─────────────────────────────────────────────────────────
/** The session a recording belongs to (embedded on video reads). */
export interface VideoSession {
  id: string;
  title?: string | null;
  date: string;
  courseId: string;
}

/** UPLOADING until Bunny's webhook confirms processing finished (never set by the client). */
export type VideoStatus = "UPLOADING" | "READY" | "FAILED";

/** A recorded lecture attached to a class session (see video.endpoints.md). */
export interface VideoRecording {
  id: string;
  title: string;
  bunnyVideoId: string;
  durationSeconds?: number | null;
  status: VideoStatus;
  classSessionId: string;
  createdAt: string;
  updatedAt: string;
  /** Included on create + list responses; omitted on metadata-only updates. */
  classSession?: VideoSession;
}

/**
 * Signed stream payload (GET /videos/:id/stream). `streamUrl` is IP-bound to
 * the requesting client, so this MUST be fetched from the browser — never from
 * a Server Component (the token would bind to the Next server's IP).
 */
export interface StreamData {
  videoId: string;
  title: string;
  durationSeconds?: number | null;
  /** Token-authenticated Bunny iframe player URL (DRM enforced by Bunny). */
  embedUrl: string;
  /** Per-viewer watermark text to overlay over the player (deters capture). */
  watermark: string;
  /** Unix seconds when the token expires (4h default). */
  expiresAt: number;
}

/**
 * Signed TUS (resumable upload) authorization (POST /videos/uploads).
 * Feed straight into tus-js-client, pointed at Bunny — the browser uploads
 * the file directly to Bunny, never through our server.
 */
export interface BunnyTusUpload {
  endpoint: string;
  libraryId: string;
  videoId: string;
  signature: string;
  expire: number;
}

export interface InitiateUploadResult {
  video: VideoRecording;
  upload: BunnyTusUpload;
}

// ── Live classes (Zoom Meeting SDK) ──────────────────────────────────────────
export interface ScheduleLiveClassResult {
  sessionId: string;
  zoomMeetingId: string;
  joinUrl: string;
}

/**
 * Signed Meeting SDK join payload (POST .../live/token). Freshly minted per
 * join attempt — never cache or reuse across page loads. `userName` is
 * server-derived (DB, never client input) for watermark traceability. `zak`
 * is present only when `role === 1` (host).
 */
export interface LiveClassToken {
  signature: string;
  sdkKey: string;
  meetingNumber: string;
  password?: string;
  role: 0 | 1;
  userName: string;
  zak?: string;
  expiresAt: number;
}

// ── Payments & attendance ────────────────────────────────────────────────────
export type PaymentMethod = "ONLINE" | "ENTRANCE" | "BULK" | "MANUAL";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
export type AttendanceSource = "QR" | "BARCODE" | "ZOOM_WEBHOOK" | "MANUAL";
export type PaymentAdjustmentType = "OVERRIDE" | "REFUND";

/** A payment row (see payments.endpoints.md). Matches the service's `paymentSelect`. */
export interface Payment {
  id: string;
  amount: string; // decimal as string
  refundedAmount: string; // completed external refunds, decimal as string
  status: PaymentStatus;
  method: PaymentMethod;
  payhereId?: string | null;
  paymentMonth: string; // "YYYY-MM"
  note?: string | null;
  collectedBy?: { id: string; name: string } | null;
  collectedAtInstitute?: { id: string; name: string; code: string } | null;
  collectedViaBarcode?: string | null;
  createdAt: string;
  updatedAt: string;
  enrollment: {
    id: string;
    classType: EnrollmentMode;
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
      indexNumber: number;
      phone?: string | null;
      address?: string | null;
      city?: string | null;
    };
    course: { id: string; name: string; year: number; monthlyFee: string };
  };
}

/** GET /payments/summary?month= — admin month aggregate. */
export interface PaymentSummary {
  month: string;
  collectedTotal: string; // "N.NN"
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount: number;
}

export interface PaymentAdjustment {
  id: string;
  type: PaymentAdjustmentType;
  amount: string | null;
  statusBefore: PaymentStatus;
  statusAfter: PaymentStatus;
  paymentAmountBefore: string;
  paymentAmountAfter: string;
  reason: string;
  externalReference: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
}

export interface RefundPaymentResult {
  payment: Pick<Payment, "id" | "amount" | "refundedAmount" | "status">;
  adjustment: PaymentAdjustment;
  remainingRefundable: string;
}

/** GET /payments/reports — global super-admin or own-course teacher aggregates. */
export interface FinancialReport {
  month: string; // "YYYY-MM"
  /** Exactly 12 entries, oldest→newest, ending at `month`; zero-filled where absent. */
  trend: { month: string; collected: string; paidCount: number }[];
  byCourse: { courseId: string; name: string; year: number | null; collected: string; paidCount: number }[];
  byTeacher: { teacherId: string; name: string; collected: string; paidCount: number }[];
  byMethod: { method: PaymentMethod; collected: string; paidCount: number }[];
  /** Active enrollments with no SUCCESS payment for `month`, and their expected fees. */
  outstanding: { count: number; expected: string };
}

/** POST /payments/bulk-upload result envelope. */
export interface BulkUploadResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/** An attendance record (see attendance.endpoints.md). Relations included on query reads. */
export interface AttendanceRecord {
  id: string;
  source: AttendanceSource;
  scannedAt: string;
  lastSeenAt: string;
  userId: string;
  classSessionId: string;
  createdAt: string;
  updatedAt: string;
  /** Included on scan/manual/roster reads (not on webhook/video responses). */
  user?: {
    id: string;
    name: string;
    email: string;
    indexNumber: number;
    barcode?: string | null;
  };
  classSession?: {
    id: string;
    title?: string | null;
    date: string;
    courseId: string;
  };
}

export interface AttendanceReconciliation {
  sessionId: string;
  zoomMeetingId: string;
  summary: {
    zoomRows: number;
    matchedStudents: number;
    alreadyRecorded: number;
    missing: number;
    unmatched: number;
    ignored: number;
  };
  participants: {
    userId: string;
    name: string;
    email: string;
    indexNumber: number;
    firstJoinAt: string;
    lastLeaveAt: string;
    durationSeconds: number;
    occurrences: number;
    status: "MISSING" | "RECORDED";
  }[];
  unmatched: {
    name: string;
    email: string | null;
    reason: "NO_MATCH" | "AMBIGUOUS" | "NOT_ENROLLED";
    occurrences: number;
  }[];
}

export interface AppliedAttendanceReconciliation extends AttendanceReconciliation {
  applied: number;
}

// ── Audit log (see audit.endpoints.md) ───────────────────────────────────────
/** One privileged-mutation event. SUPER_ADMIN only (see 2026-07-10 role-guard fix). */
export interface AuditLogEntry {
  id: string;
  action: string;
  description: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  actorId: string;
  actorRole: Role;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
}

// ── Notifications (see notification.endpoints.md) ────────────────────────────
export type NotificationType = "RESULTS_PUBLISHED" | "PAYMENT_CONFIRMED" | "PAYMENT_OVERRIDDEN";
export type NotificationChannel = "IN_APP" | "SMS";

export interface NotificationEntry {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** GET /notifications/me — ApiList<NotificationEntry> plus an unread count. */
export interface NotificationListResponse extends ApiList<NotificationEntry> {
  unreadCount: number;
}

/** Super-admin-configurable per-(type, channel) on/off switch. */
export interface NotificationSetting {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
  updatedAt: string;
}

/** GET /classes/public — unauthenticated, marketing-safe fields only. */
export interface PublicCourse {
  id: string;
  name: string;
  year: number;
  description: string | null;
  monthlyFee: string;
  bannerUrl: string | null;
  bannerAlt: string | null;
  backdropUrl: string | null;
  backdropAlt: string | null;
  subject: { name: string };
  teacher: { name: string };
}

/** GET /timetable/public/upcoming — unauthenticated, marketing-safe fields only. */
export interface PublicUpcomingSession {
  id: string;
  title: string;
  date: string;
  durationMinutes: number;
  classType: ClassType;
  course: {
    name: string;
    subject: { name: string };
  };
}
