/**
 * The one and only backend client. Every call to the Express/Prisma API goes
 * through here so that base URL, cookie auth, JSON handling, error
 * normalization, and 401→refresh→retry stay uniform.
 *
 * See `context/frontend/04-api-integration.md` for the full contract.
 *
 * Auth is via HTTP-only cookies:
 *  - Browser calls send them automatically thanks to `credentials: "include"`.
 *  - Server Components must forward them by passing `{ cookie }` (the serialized
 *    `Cookie` header from `await cookies()`), because server fetches don't carry
 *    the browser's cookies on their own.
 */

import { API_URL } from "./env";
import type { FieldError } from "./types";

/** Normalized error thrown by every failed request. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Service error code, e.g. "NOT_ENROLLED", "PAYMENT_REQUIRED". */
    public code?: string,
    /** Field-level validation errors from a 400. */
    public fields?: FieldError[],
    /** True when a 401 signals an expired (refreshable) access token. */
    public expired?: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiOptions extends RequestInit {
  /** Serialized `Cookie` header to forward from a Server Component. */
  cookie?: string;
  /** Internal: prevents infinite refresh loops. */
  _retry?: boolean;
}

/** Shape of the JSON envelope the backend returns on error. */
interface ErrorBody {
  message?: string;
  code?: string;
  data?: unknown;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { cookie, _retry, headers, body, ...rest } = opts;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    body,
    credentials: "include", // attach cookies in the browser
    headers: {
      // Only set JSON content-type when sending a JSON string body.
      ...(body && typeof body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}), // forward cookies on the server
      ...headers,
    },
    cache: "no-store", // API data is per-user & auth-gated; never cache by default
  });

  const parsed = await parseBody(res);
  const payload: ErrorBody =
    parsed && typeof parsed === "object" ? (parsed as ErrorBody) : {};

  if (!res.ok) {
    const expired =
      res.status === 401 &&
      typeof payload.data === "object" &&
      payload.data !== null &&
      (payload.data as { expired?: boolean }).expired === true;

    // Browser-side: try a single silent refresh, then replay the request.
    if (expired && isBrowser() && !_retry && !path.startsWith("/auth/refresh")) {
      const refreshed = await refresh();
      if (refreshed) {
        return request<T>(path, { ...opts, _retry: true });
      }
    }

    throw new ApiError(
      res.status,
      payload.message ?? "Request failed.",
      payload.code,
      Array.isArray(payload.data) ? (payload.data as FieldError[]) : undefined,
      expired,
    );
  }

  return parsed as T;
}

/** Rotate tokens via the refresh cookie. Returns true on success. */
async function refresh(): Promise<boolean> {
  try {
    await request("/auth/refresh", { method: "POST", _retry: true });
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "GET" }),

  post: <T>(path: string, data?: unknown, opts?: ApiOptions) =>
    request<T>(path, {
      ...opts,
      method: "POST",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),

  patch: <T>(path: string, data?: unknown, opts?: ApiOptions) =>
    request<T>(path, {
      ...opts,
      method: "PATCH",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),

  del: <T>(path: string, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};
