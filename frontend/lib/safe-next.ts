const DEFAULT_NEXT = "/dashboard";
// Pages that would bounce straight back; /auth/account-setup is a legitimate destination.
const AUTH_LANDING_PAGES = /^\/auth\/(session|login|signup)(\/|\?|#|$)/;

/**
 * Validates a post-login / post-refresh redirect target. Only a relative path
 * that starts with a single `/` is allowed, so `?next=` can never become an
 * open redirect. The session, login and signup pages are refused to avoid bounce loops.
 */
export function safeNext(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT,
): string {
  if (typeof raw !== "string" || raw === "") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Backslashes and control characters are treated as separators by some browsers.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) {
    return fallback;
  }
  if (AUTH_LANDING_PAGES.test(decoded)) return fallback;
  return raw;
}
