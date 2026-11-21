// ─── Shared Constants ────────────────────────────────────────
// All magic values live here. Nothing is hardcoded inline.

// ─── Auth ────────────────────────────────────────────────────

/** bcrypt salt rounds — 12 is a good balance between security and speed */
export const BCRYPT_SALT_ROUNDS = 12;

/** Cookie names for access and refresh tokens */
export const COOKIE_ACCESS_TOKEN = 'access_token';

/** Requests a user with `mustChangePassword` may still make (method and path without query or trailing slash). */
export const MUST_CHANGE_PASSWORD_ALLOWED_ROUTES: ReadonlyArray<readonly [method: string, path: string]> = [
	['GET', '/api/auth/me'],
	['POST', '/api/auth/logout'],
	['POST', '/api/auth/refresh'],
	['PATCH', '/api/users/me/password'],
];
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

// ─── Zoom Live Classes (Meeting SDK) ────────────────────────

/**
 * Meeting SDK JWT lifetime. Zoom enforces a 30-min FLOOR (`exp - iat` must be
 * between 1800 and 172800 seconds) — this is the minimum allowed, kept short
 * per the "single-use, short-lived" join-token requirement. We don't persist
 * or reuse a token across page loads; a fresh one is minted on every join.
 */
export const ZOOM_SDK_JWT_TTL_SECONDS = 30 * 60;

/** Server-to-Server OAuth access tokens last ~1h; cache a bit under that. */
export const ZOOM_ACCESS_TOKEN_CACHE_TTL_SECONDS = 50 * 60;

/**
 * Throttle window for join-token issuance, per (session, user) — Redis SET NX.
 * Blocks trivial rapid-fire re-issuance (e.g. two tabs opened at once, a
 * link handed to someone else and clicked seconds later) without punishing a
 * legitimate reconnect a few seconds on.
 */
export const ZOOM_JOIN_TOKEN_THROTTLE_SECONDS = 8;

// ─── Idempotency ────────────────────────────────────────────

/** HTTP header name for the client-provided idempotency key */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** How long to keep idempotency records before cleanup (24 hours in ms) */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Bunny.net Video Streaming ──────────────────────────────

/**
 * How long a signed Bunny.net embed token stays valid (4 hours; not IP-bound).
 * Long enough to watch a full lecture.
 */
export const BUNNY_TOKEN_TTL_SECONDS = 4 * 60 * 60;

/** Bunny Stream management API base (create video, etc). */
export const BUNNY_MANAGEMENT_BASE_URL = 'https://video.bunnycdn.com/library';

/** Bunny's TUS (resumable upload) endpoint — the browser uploads here directly. */
export const BUNNY_TUS_UPLOAD_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

/**
 * How long a signed TUS upload authorization stays valid (2 hours). Generous
 * relative to the 15-min R2 presign TTL because raw lecture video files are
 * large and teachers may be on slow connections; tus-js-client resumes across
 * network drops as long as the signature hasn't expired.
 */
export const BUNNY_UPLOAD_AUTH_TTL_SECONDS = 2 * 60 * 60;

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

// ─── Student Account Setup (NIC photos, R2) ────────────────

/** Allowed MIME types for NIC front/back photo uploads */
export const NIC_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;

/** Max upload size per NIC photo (10 MB) */
export const NIC_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Presigned URL lifetime for NIC photo uploads (15 minutes) */
export const NIC_IMAGE_URL_TTL_SECONDS = 15 * 60;

/** R2 object key prefix for NIC photos */
export const NIC_IMAGE_KEY_PREFIX = 'nic';

// ─── Profile (avatar + credential cooldown) ────────────────

/** Allowed content types for a profile avatar upload. */
export const AVATAR_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Max avatar size — 5 MB. */
export const AVATAR_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

// ─── Course display assets ─────────────────────────────────

export const COURSE_ASSET_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const COURSE_ASSET_MAX_SIZE_BYTES = 8 * 1024 * 1024;
export const COURSE_ASSET_URL_TTL_SECONDS = 15 * 60;
export const COURSE_ASSET_REQUIREMENTS = {
	BANNER: { width: 1600, height: 600, path: 'banner' },
	BACKDROP: { width: 1920, height: 1080, path: 'backdrop' },
} as const;

// ─── Private course materials ─────────────────────────────

export const COURSE_MATERIAL_CONTENT_TYPES = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
] as const;
export const COURSE_MATERIAL_MAX_SIZE_BYTES = 25 * 1024 * 1024;
export const COURSE_MATERIAL_MAX_IMAGE_PIXELS = 25_000_000;
export const COURSE_MATERIAL_URL_TTL_SECONDS = 15 * 60;
export const COURSE_MATERIAL_KEY_PREFIX = 'course-materials';

/** Minimum gap between self email/password changes — 7 days. */
export const CREDENTIAL_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
	OWNER_ADDED: 'OWNER_ADDED',
	OWNER_PASSWORD_RESET: 'OWNER_PASSWORD_RESET',
	PASSWORD_RESET_BY_STAFF: 'PASSWORD_RESET_BY_STAFF',
	USER_ACTIVATED: 'USER_ACTIVATED',
	USER_DEACTIVATED: 'USER_DEACTIVATED',
	BARCODE_ASSIGNED: 'BARCODE_ASSIGNED',

	// Account setup (NIC photos + institute barcodes)
	NIC_UPLOAD_URL: 'NIC_UPLOAD_URL',
	STUDENT_BARCODE_ASSIGNED: 'STUDENT_BARCODE_ASSIGNED',
	STUDENT_BARCODE_REMOVED: 'STUDENT_BARCODE_REMOVED',

	// Subjects
	SUBJECT_CREATED: 'SUBJECT_CREATED',
	SUBJECT_UPDATED: 'SUBJECT_UPDATED',
	SUBJECT_TEACHERS_ASSIGNED: 'SUBJECT_TEACHERS_ASSIGNED',

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
	COURSE_TEACHER_ASSIGNED: 'COURSE_TEACHER_ASSIGNED',
	COURSE_ASSET_UPLOAD_URL: 'COURSE_ASSET_UPLOAD_URL',
	COURSE_ASSET_UPDATED: 'COURSE_ASSET_UPDATED',
	COURSE_ASSET_REMOVED: 'COURSE_ASSET_REMOVED',
	COURSE_MODULE_CREATED: 'COURSE_MODULE_CREATED',
	COURSE_MODULE_UPDATED: 'COURSE_MODULE_UPDATED',
	COURSE_MODULE_REMOVED: 'COURSE_MODULE_REMOVED',
	COURSE_MATERIAL_UPLOAD_URL: 'COURSE_MATERIAL_UPLOAD_URL',
	COURSE_MATERIAL_ATTACHED: 'COURSE_MATERIAL_ATTACHED',
	COURSE_MATERIAL_UPDATED: 'COURSE_MATERIAL_UPDATED',
	COURSE_MATERIAL_REMOVED: 'COURSE_MATERIAL_REMOVED',
	COURSE_MATERIAL_DOWNLOADED: 'COURSE_MATERIAL_DOWNLOADED',

	// Class sessions
	SESSION_CREATED: 'SESSION_CREATED',
	SESSION_UPDATED: 'SESSION_UPDATED',
	SESSION_DELETED: 'SESSION_DELETED',
	LIVE_CLASS_SCHEDULED: 'LIVE_CLASS_SCHEDULED',

	// Recorded lessons
	VIDEO_UPLOAD_INITIATED: 'VIDEO_UPLOAD_INITIATED',
	VIDEO_ATTACHED: 'VIDEO_ATTACHED',
	VIDEO_UPDATED: 'VIDEO_UPDATED',
	VIDEO_DELETED: 'VIDEO_DELETED',
	RECORDING_STREAM_STAFF: 'RECORDING_STREAM_STAFF',

	// Exams
	EXAM_CREATED: 'EXAM_CREATED',
	EXAM_UPDATED: 'EXAM_UPDATED',
	EXAM_DELETED: 'EXAM_DELETED',
	MARKERS_ASSIGNED: 'MARKERS_ASSIGNED',
	EXAM_UPLOAD_URL: 'EXAM_UPLOAD_URL',
	EXAM_PAPER_ATTACHED: 'EXAM_PAPER_ATTACHED',
	MARKER_GROUP_CREATED: 'MARKER_GROUP_CREATED',
	MARKER_GROUP_UPDATED: 'MARKER_GROUP_UPDATED',
	MARKER_GROUP_MEMBERS_REPLACED: 'MARKER_GROUP_MEMBERS_REPLACED',

	// Submissions + marking
	MARKS_SUBMITTED: 'MARKS_SUBMITTED',
	RESULTS_PUBLISHED: 'RESULTS_PUBLISHED',
	RESULT_CORRECTED: 'RESULT_CORRECTED',
	HALL_MARKS_ENTERED: 'HALL_MARKS_ENTERED',

	// Enrollments
	ENROLLMENT_CREATED: 'ENROLLMENT_CREATED',
	ENROLLMENT_CANCELLED: 'ENROLLMENT_CANCELLED',

	// Payments
	PAYMENT_OVERRIDDEN: 'PAYMENT_OVERRIDDEN',
	PAYMENT_BULK_UPLOAD: 'PAYMENT_BULK_UPLOAD',
	PAYMENT_ENTRANCE_COLLECTED: 'PAYMENT_ENTRANCE_COLLECTED',
	PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',

	// Attendance
	ATTENDANCE_MANUAL: 'ATTENDANCE_MANUAL',
	ATTENDANCE_BARCODE: 'ATTENDANCE_BARCODE',
	ATTENDANCE_RECONCILED: 'ATTENDANCE_RECONCILED',

	// Notifications
	NOTIFICATION_SETTING_UPDATED: 'NOTIFICATION_SETTING_UPDATED',
	SETTING_CHANGED: 'SETTING_CHANGED',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

// ─── Notification Templates ─────────────────────────────────
// Keyed by NotificationType (Prisma enum) — one title + message pair for the
// in-app Notification row, one body for SMS. Mustache-style {placeholder}s
// filled by NotificationService.dispatch(). New scenarios need only a new
// entry here (plus the matching NotificationType enum value in schema.prisma).
export const NOTIFICATION_TEMPLATES = {
	RESULTS_PUBLISHED: {
		title: 'Results published',
		inApp: 'Results for {examTitle} are now available.',
		sms: 'Results published for {examTitle}. Log in to view.',
	},
	PAYMENT_CONFIRMED: {
		title: 'Payment confirmed',
		inApp: 'Your payment for {courseName} ({paymentMonth}) was confirmed.',
		sms: 'Payment received for {courseName} {paymentMonth}. Thank you.',
	},
	PAYMENT_OVERRIDDEN: {
		title: 'Payment updated',
		inApp: 'Your payment for {courseName} ({paymentMonth}) was updated. Status: {status}.',
		sms: 'Payment for {courseName} {paymentMonth} has been updated. Status: {status}.',
	},
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

// ─── Tenancy ─────────────────────────────────────────────────

/** Id of the one default organization every row belongs to until M2 introduces per-request tenant context. */
export const DEFAULT_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
