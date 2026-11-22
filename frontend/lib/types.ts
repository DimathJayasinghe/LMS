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
  organization?: { id: string; name: string; timezone: string } | null;
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
  /** Set by a staff-assisted reset: only the change-password screen works until the user chooses a new password. */
  mustChangePassword?: boolean;
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

export type CourseModuleStatus = "DRAFT" | "PUBLISHED";

export interface CourseMaterial {
  id: string;
  type: "FILE";
  title: string;
  description: string | null;
  position: number;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  downloadable: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseModule {
  id: string;
  title: string;
  description: string | null;
  position: number;
  status: CourseModuleStatus;
  releaseAt: string | null;
  courseId: string;
  materials: CourseMaterial[];
  createdAt: string;
  updatedAt: string;
}

export interface CourseMaterialUploadUrlResult {
  uploadUrl: string;
  key: string;
  expiresAt: string;
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
  zoomMeetingId?: string | null;
  liveScheduled: boolean;
  /** True when at least one READY recording exists (all roles; students and the teacher can open it). */
  hasRecording: boolean;
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
  isActive: boolean;
  courseId: string;
  instituteId?: string | null;
  createdAt: string;
  updatedAt: string;
  course?: { name: string; year: number };
  institute?: { name: string } | null;
}

export interface UpcomingTimetableSession {
  id: string;
  title: string;
  date: string;
  durationMinutes: number;
  classType: ClassType;
  courseId: string;
  liveScheduled: boolean;
  course: { name: string; year: number };
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

/** A student's own audience of a scoped exam: where and how they sit it. The server derives it from the roster. */
export interface MyAudience {
  label: string;
  deliveryMode: "ONLINE" | "PHYSICAL";
  instituteName: string | null;
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
  /** Set for a scoped exam (one with audiences); null for a course-wide exam. */
  paperRevisionId?: string | null;
  /** Students only; null for a course-wide exam. */
  myAudience?: MyAudience | null;
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
  /** Provider video id field: sent only to the owning teacher and the owner (a student's signed embed URL contains it, by design). */
  bunnyVideoId?: string;
  durationSeconds?: number | null;
  status: VideoStatus;
  classSessionId: string;
  createdAt: string;
  updatedAt: string;
  /** Included on create + list responses; omitted on metadata-only updates. */
  classSession?: VideoSession;
}

/**
 * Signed stream payload (GET /videos/:id/stream). The embed URL is
 * token-authenticated with a 4-hour TTL and is NOT bound to the viewer's IP; it
 * is still fetched from the browser (per-viewer watermark, short-lived token),
 * not from a Server Component.
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
  liveScheduled: true;
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
export type AttendanceSource = "QR" | "BARCODE" | "ZOOM_WEBHOOK" | "MANUAL" | "VIDEO";
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

/** One row of GET /payments/outstanding: an active enrollment with no paid row for the month. */
export interface OutstandingRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  indexNumber: number;
  /** The student's own mobile (a guardian number replaces it later). */
  phone: string | null;
  courseId: string;
  courseName: string;
  classType: EnrollmentMode;
  monthsOwed: number;
  /** Fee for the requested month, "N.NN". */
  amount: string;
  /** Fee for every owed month in the arrears window, "N.NN". */
  totalOwed: string;
  inGrace: boolean;
  /** Last grace day of the current month ("YYYY-MM-DD"), null for past months or when grace is off. */
  graceUntil: string | null;
}

export type ReminderSkipReason = "NOT_OWING" | "IN_GRACE" | "REMINDER_LIMIT_REACHED";

/** POST /payments/outstanding/reminders — one reminder per student, plus the enrollments left out and why. */
export interface ReminderResult {
  sent: number;
  skipped: { enrollmentId: string; reason: ReminderSkipReason }[];
}

/** A stored end-of-day count, with the checks the screen shows (GET /payments/cash). */
export interface CashTallyView {
  id: string;
  countedAmount: string;
  systemAmount: string;
  /** Counted minus system, "N.NN"; negative means the clerk is short. */
  variance: string;
  paymentCount: number;
  note: string | null;
  closedAt: string;
  /** The difference is beyond the owner's threshold. */
  flagged: boolean;
  /** Cash was taken, refunded or changed after the count. */
  staleSinceClose: boolean;
  reconciledAt: string | null;
  reconciledByName: string | null;
}

/** One collector's cash for one Colombo day at one branch, with the count for it when there is one. */
export interface CashRow {
  day: string;
  collectorId: string;
  collectorName: string;
  instituteId: string | null;
  instituteName: string | null;
  amount: string;
  paymentCount: number;
  tally: CashTallyView | null;
}

/** GET /payments/cash and /payments/cash-tally. */
export interface CashList extends ApiList<CashRow> {
  from: string;
  to: string;
  /** False when the owner turned the end-of-day count off. */
  tallyEnabled: boolean;
}

/** One student in GET /classes/:id/roster: no contact details, amounts or ID numbers by design. */
export interface RosterRow {
  studentId: string;
  name: string;
  indexNumber: number;
  classType: "ONLINE" | "PHYSICAL";
  enrolledAt: string;
  /** Absent when the owner turned the paid state off for teachers. */
  feeState?: "PAID" | "NOT_PAID";
  /** Sessions attended out of the last held sessions (up to the owner's window). */
  attendedLastN: { attended: number; sessions: number };
}

export interface RosterList extends ApiList<RosterRow> {
  page: number;
  pageSize: number;
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

/** POST /payments/bulk-upload result. `applied` is true only when the payments were saved; a check (`dryRun`) or a file with any refused row saves nothing. */
export interface BulkUploadResult {
  dryRun: boolean;
  applied: boolean;
  total: number;
  /** Rows that become new payments (or would, in a check). */
  created: number;
  /** Rows that turn an unpaid or failed payment into a paid one. */
  updated: number;
  errors: { row: number; message: string }[];
}

/** GET /users/lookup: the little a desk needs to pick a student. No contact details or identity numbers. */
export interface StudentLookupRow {
  id: string;
  name: string;
  indexNumber: number;
  profileImage: string | null;
}

/** What the entrance scan reports about the scanned student (POST /attendance/scan, `data.context`). */
export type ScanWarning = "NOT_ENROLLED" | "MODE_MISMATCH" | "FEE_IN_GRACE" | "FEE_UNPAID";

export interface ScanContext {
  enrollmentState: "ENROLLED" | "NOT_ENROLLED" | "MODE_MISMATCH";
  /** A payment covers the current billing month (strictly paid, not merely inside grace). */
  paidThisMonth: boolean;
  covered: "PAID" | "GRACE" | "UNPAID";
  month: string;
  graceUntil: string | null;
  warnings: ScanWarning[];
  student: { name: string; indexNumber: number; profileImage: string | null };
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
    /** Roster and scan reads only; per-student history omits it. */
    email?: string;
    indexNumber: number;
    /** Roster and scan reads only; per-student history omits it. */
    barcode?: string | null;
  };
  classSession?: {
    id: string;
    title?: string | null;
    date: string;
    courseId: string;
  };
}

/** POST /attendance/scan responds with the record and what the door needs to know. */
export type ScanAttendanceRecord = AttendanceRecord & { context: ScanContext };

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
export type NotificationType = "RESULTS_PUBLISHED" | "PAYMENT_CONFIRMED" | "PAYMENT_OVERRIDDEN" | "FEE_DUE";
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

// ─── Hall marks (paper exams sat in the hall) ─────────────────

export type HallMarkRowStatus =
  | "OK"
  | "WILL_CHANGE"
  | "UNKNOWN_INDEX"
  | "NOT_ELIGIBLE"
  | "NOT_ASSIGNED"
  | "DUPLICATE_IN_BATCH"
  | "OUT_OF_RANGE"
  | "ONLINE_SUBMISSION_EXISTS"
  | "MARKS_SET_BY_TEACHER";

export interface HallMarkRow {
  line: number;
  indexNumber: number;
  marks: number;
  status: HallMarkRowStatus;
  before?: number | null;
  after?: number;
  /** Present for teachers and the owner only. */
  name?: string;
}

export interface HallMarksResult {
  dryRun: boolean;
  applied: boolean;
  counts: { total: number; changed: number; unchanged: number; rejected: number };
  rows: HallMarkRow[];
}
