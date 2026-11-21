/**
 * Reads the `exp` claim of an access-token JWT WITHOUT verifying it.
 *
 * This is a routing hint only: it lets the frontend proxy send a navigation
 * through the silent-refresh page before any protected UI renders. The backend
 * still verifies every token, so a forged cookie gains nothing here. Anything
 * unreadable counts as "not expired" and falls through to the existing guards.
 */
export function isAccessTokenExpired(
  cookieValue: string | undefined,
  nowSeconds: number,
): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== "object") return false;
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === "number" && exp <= nowSeconds;
  } catch {
    return false;
  }
}
