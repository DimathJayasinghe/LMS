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
export const RATE_LIMIT_AUTH_MAX = 20;

/** Auth rate limit window in milliseconds (1 minute) */
export const RATE_LIMIT_AUTH_WINDOW_MS = 60 * 1000;

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
