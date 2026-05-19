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
