import { NextResponse, type NextRequest } from "next/server";
import { isAccessTokenExpired } from "@/lib/session-hint";

/**
 * Session continuity. The access cookie now outlives the 15-minute JWT, so a
 * returning user arrives here with a cookie whose token has expired. Server
 * Components cannot set cookies, so instead of letting the `(app)` layout bounce
 * that user to login, send the navigation through `/auth/session`, a small client
 * page that performs one coordinated refresh and returns to the page requested.
 *
 * The `exp` read is a hint, not authorization: the backend still verifies every
 * token. See context/frontend/04-api-integration.md §6.
 */
export function proxy(request: NextRequest) {
  if (request.method !== "GET") return NextResponse.next();
  // The matcher already excludes /auth; repeated here so a matcher edit cannot create a redirect loop.
  if (request.nextUrl.pathname.startsWith("/auth/")) return NextResponse.next();

  const accessToken = request.cookies.get("access_token")?.value;
  if (!isAccessTokenExpired(accessToken, Math.floor(Date.now() / 1000))) {
    return NextResponse.next();
  }

  // Soft navigations are RSC fetches that carry a cache-busting `_rsc` param;
  // it must not leak into the page we send the user back to.
  const target = request.nextUrl.clone();
  target.searchParams.delete("_rsc");
  const next = `${target.pathname}${target.search}`;

  const session = request.nextUrl.clone();
  session.pathname = "/auth/session";
  session.search = "";
  session.searchParams.set("next", next);
  return NextResponse.redirect(session);
}

// Matcher values must be constants (statically analysed at build time).
// Excluded: API routes, Next internals, static files, and the /auth pages
// (so the refresh page itself can never bounce). Prefetches are skipped via
// `missing` because Next strips these headers before the proxy runs, so they
// cannot be checked in code.
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|auth/|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
