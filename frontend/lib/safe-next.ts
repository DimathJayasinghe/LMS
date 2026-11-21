const DEFAULT_NEXT = "/dashboard";

/**
 * Validates a post-login / post-refresh redirect target. Only a relative path
 * that starts with a single `/` is allowed, so `?next=` can never become an
 * open redirect. The auth pages themselves are refused to avoid bounce loops.
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
  if (decoded === "/auth" || decoded.startsWith("/auth/")) return fallback;
  return raw;
}
