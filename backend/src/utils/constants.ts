// ─── Shared Constants ────────────────────────────────────────
// All magic values live here. Nothing is hardcoded inline.

// ─── Auth ────────────────────────────────────────────────────

/** bcrypt salt rounds — 12 is a good balance between security and speed */
export const BCRYPT_SALT_ROUNDS = 12;

/** Cookie names for access and refresh tokens */
export const COOKIE_ACCESS_TOKEN = 'access_token';
export const COOKIE_REFRESH_TOKEN = 'refresh_token';

/** Cookie config shared between set and clear operations */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

// ─── Rate Limiting ───────────────────────────────────────────

/** Global API rate limit: requests per window */
export const RATE_LIMIT_GLOBAL_MAX = 100;

/** Global rate limit window in milliseconds (1 minute) */
export const RATE_LIMIT_GLOBAL_WINDOW_MS = 60 * 1000;

/** Auth endpoints: stricter limit to prevent brute-force */
export const RATE_LIMIT_AUTH_MAX = 10;

/** Auth rate limit window in milliseconds (1 minute) */
export const RATE_LIMIT_AUTH_WINDOW_MS = 60 * 1000;

/** Stream-token endpoint: cap per IP to stop scripted harvesting of Bunny tokens (architecture §7.1) */
export const RATE_LIMIT_STREAM_MAX = 30;

/** Stream rate limit window in milliseconds (1 minute) */
export const RATE_LIMIT_STREAM_WINDOW_MS = 60 * 1000;

// ─── Zoom Webhooks ─────────────────────────────────────────

/** Allowed timestamp skew for Zoom webhook signatures (seconds) */
export const ZOOM_WEBHOOK_MAX_SKEW_SECONDS = 5 * 60;

// ─── Idempotency ────────────────────────────────────────────

/** HTTP header name for the client-provided idempotency key */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** How long to keep idempotency records before cleanup (24 hours in ms) */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Bunny.net Video Streaming ──────────────────────────────

/**
 * How long an IP-bound Bunny.net stream token stays valid (4 hours).
 * Long enough to watch a full lecture; short enough to limit replay attacks.
 */
export const BUNNY_TOKEN_TTL_SECONDS = 4 * 60 * 60;

// ─── Exams + R2 (Paper PDFs) ───────────────────────────────

/** Allowed MIME type for exam paper uploads */
export const EXAM_PDF_CONTENT_TYPE = 'application/pdf';

/** Max upload size for exam PDFs (50 MB) */
export const EXAM_PDF_MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Presigned URL lifetime for uploads/downloads (15 minutes) */
export const EXAM_PDF_URL_TTL_SECONDS = 15 * 60;

/** R2 object key prefix for exam papers */
export const EXAM_PDF_KEY_PREFIX = 'exams';

// ─── Submissions + Answers (R2 PDFs) ───────────────────────

/** Allowed MIME type for answer PDF uploads */
export const ANSWER_PDF_CONTENT_TYPE = 'application/pdf';

/** Max upload size for answer PDFs (50 MB) */
export const ANSWER_PDF_MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Presigned URL lifetime for answer uploads/downloads (15 minutes) */
export const ANSWER_PDF_URL_TTL_SECONDS = 15 * 60;

/** R2 object key prefix for student answer PDFs */
export const ANSWER_PDF_KEY_PREFIX = 'answers';

// ─── Payments + PayHere ───────────────────────────────────

/** PayHere checkout path appended to PAYHERE_BASE_URL */
export const PAYHERE_CHECKOUT_PATH = '/pay/checkout';

/** PayHere default currency code */
export const PAYHERE_CURRENCY = 'LKR';

/** Default country value for PayHere customer payload */
export const PAYHERE_COUNTRY = 'Sri Lanka';

/** PayHere status codes */
export const PAYHERE_STATUS_SUCCESS = 2;
export const PAYHERE_STATUS_PENDING = 0;
export const PAYHERE_STATUS_CANCELED = -1;
export const PAYHERE_STATUS_FAILED = -2;
export const PAYHERE_STATUS_CHARGEDBACK = -3;

/** Payment month format: YYYY-MM */
export const PAYMENT_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Max upload size for payment bulk upload files (5 MB) */
export const PAYMENTS_BULK_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

// ─── Server-Sent Events (SSE) ───────────────────────────────

/** Redis Pub/Sub channel for cross-instance SSE delivery */
export const SSE_REDIS_CHANNEL = 'lms:sse:events';

/** Heartbeat interval to keep proxies from closing idle streams (30s) */
export const SSE_HEARTBEAT_MS = 30 * 1000;

// ─── BullMQ Jobs ───────────────────────────────────────────

/** Queue names for background jobs */
export const JOB_QUEUE_SMS = 'lms_sms';
export const JOB_QUEUE_TIMETABLE = 'lms_timetable';

/** Job names per queue */
export const JOB_NAME_SEND_SMS = 'send_sms';
export const JOB_NAME_GENERATE_SESSIONS = 'generate_sessions';

/** Repeatable-job cron: generate next week's sessions every Sunday 20:00 UTC */
export const JOB_CRON_WEEKLY_TIMETABLE = '0 20 * * 0';

/** How many days ahead the weekly generator materializes sessions */
export const TIMETABLE_GENERATE_AHEAD_DAYS = 14;

/** Asia/Colombo is UTC+5:30 — offset in minutes for timetable time math */
export const COLOMBO_UTC_OFFSET_MIN = 330;

/** Default retry attempts for background jobs */
export const JOB_DEFAULT_ATTEMPTS = 3;

/** Default backoff delay for retries (ms) */
export const JOB_DEFAULT_BACKOFF_MS = 5000;

/** Worker concurrency per queue */
export const JOB_SMS_CONCURRENCY = 5;

/** Cleanup behavior for completed/failed jobs */
export const JOB_REMOVE_ON_COMPLETE = true;
export const JOB_REMOVE_ON_FAIL = false;

// ─── Audit Actions ─────────────────────────────────────────
// All action names are centralised here for consistency and grep-ability.

export const AUDIT_ACTION = {
	// User management
	ROLE_CHANGED: 'ROLE_CHANGED',
	USER_ACTIVATED: 'USER_ACTIVATED',
	USER_DEACTIVATED: 'USER_DEACTIVATED',
	BARCODE_ASSIGNED: 'BARCODE_ASSIGNED',

	// Subjects
	SUBJECT_CREATED: 'SUBJECT_CREATED',
	SUBJECT_UPDATED: 'SUBJECT_UPDATED',

	// Institutes
	INSTITUTE_CREATED: 'INSTITUTE_CREATED',
	INSTITUTE_UPDATED: 'INSTITUTE_UPDATED',

	// Timetable
	TIMETABLE_SLOT_CREATED: 'TIMETABLE_SLOT_CREATED',
	TIMETABLE_SLOT_UPDATED: 'TIMETABLE_SLOT_UPDATED',
	TIMETABLE_SLOT_DELETED: 'TIMETABLE_SLOT_DELETED',
	TIMETABLE_GENERATED: 'TIMETABLE_GENERATED',

	// Classes (courses)
	CLASS_CREATED: 'CLASS_CREATED',
	CLASS_UPDATED: 'CLASS_UPDATED',

	// Class sessions
	SESSION_CREATED: 'SESSION_CREATED',
	SESSION_UPDATED: 'SESSION_UPDATED',
	SESSION_DELETED: 'SESSION_DELETED',

	// Exams
	EXAM_CREATED: 'EXAM_CREATED',
	EXAM_UPDATED: 'EXAM_UPDATED',
	EXAM_DELETED: 'EXAM_DELETED',
	MARKERS_ASSIGNED: 'MARKERS_ASSIGNED',
	EXAM_UPLOAD_URL: 'EXAM_UPLOAD_URL',

	// Submissions + marking
	MARKS_SUBMITTED: 'MARKS_SUBMITTED',
	RESULTS_PUBLISHED: 'RESULTS_PUBLISHED',

	// Enrollments
	ENROLLMENT_CREATED: 'ENROLLMENT_CREATED',
	ENROLLMENT_CANCELLED: 'ENROLLMENT_CANCELLED',

	// Payments
	PAYMENT_OVERRIDDEN: 'PAYMENT_OVERRIDDEN',
	PAYMENT_BULK_UPLOAD: 'PAYMENT_BULK_UPLOAD',

	// Attendance
	ATTENDANCE_MANUAL: 'ATTENDANCE_MANUAL',
	ATTENDANCE_BARCODE: 'ATTENDANCE_BARCODE',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

// ─── SMS Templates ─────────────────────────────────────────
// Mustache-style placeholders. New events require only a new entry here.

export const SMS_TEMPLATES = {
	RESULTS_PUBLISHED: 'Results published for {examTitle}. Log in to view.',
	PAYMENT_CONFIRMED: 'Payment received for {courseName} {paymentMonth}. Thank you.',
	PAYMENT_OVERRIDE: 'Payment for {courseName} {paymentMonth} has been updated. Status: {status}.',
} as const;

export type SmsTemplateKey = keyof typeof SMS_TEMPLATES;

