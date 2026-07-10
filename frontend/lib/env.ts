/**
 * Typed access to public environment variables.
 *
 * Only `NEXT_PUBLIC_*` vars are available in the browser bundle. The frontend
 * needs no server secrets — auth is entirely via the backend's HTTP-only cookies.
 */

/** Base URL of the backend API, including the `/api` prefix. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
