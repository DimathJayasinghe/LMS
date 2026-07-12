/**
 * Typed access to public environment variables.
 *
 * Only `NEXT_PUBLIC_*` vars are available in the browser bundle. The frontend
 * needs no server secrets — auth is entirely via the backend's HTTP-only cookies.
 */

// The API base differs by execution context when the frontend runs behind the
// same nginx as the backend (dev-in-compose / ngrok):
//   - Browser  → `NEXT_PUBLIC_API_URL` (baked at build time). Set it to a
//     same-origin relative path like `/api` so the app works on localhost, the
//     ngrok domain, or a real domain without rebuilding.
//   - Server (SSR) → `INTERNAL_API_URL` (runtime) so server components reach the
//     backend directly (e.g. http://backend:5000/api) instead of hair-pinning
//     out through the public URL. Falls back to the browser URL when unset (the
//     classic split dev setup where both point at http://localhost:80/api).
const browserApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const serverApiUrl = process.env.INTERNAL_API_URL ?? browserApiUrl;

/** Base URL of the backend API, including the `/api` prefix. */
export const API_URL = typeof window === "undefined" ? serverApiUrl : browserApiUrl;
