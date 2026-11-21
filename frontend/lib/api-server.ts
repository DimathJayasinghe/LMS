import { headers } from "next/headers";
import { api as clientApi } from "./api";
import type { ApiOptions } from "./api";

async function options(opts?: ApiOptions): Promise<ApiOptions> {
  const forwarded = new Headers(opts?.headers);
  if (process.env.INTERNAL_API_URL) {
    try {
      const address = (await headers()).get("x-real-ip");
      if (address) forwarded.set("X-Forwarded-For", address);
    } catch {
      // Static rendering and background work have no incoming request.
    }
  }
  return { ...opts, headers: Object.fromEntries(forwarded.entries()) };
}

export const api = {
  get: async <T>(path: string, opts?: ApiOptions) => clientApi.get<T>(path, await options(opts)),
  post: async <T>(path: string, data?: unknown, opts?: ApiOptions) => clientApi.post<T>(path, data, await options(opts)),
  put: async <T>(path: string, data?: unknown, opts?: ApiOptions) => clientApi.put<T>(path, data, await options(opts)),
  patch: async <T>(path: string, data?: unknown, opts?: ApiOptions) => clientApi.patch<T>(path, data, await options(opts)),
  del: async <T>(path: string, opts?: ApiOptions) => clientApi.del<T>(path, await options(opts)),
  upload: async <T>(path: string, form: FormData, opts?: ApiOptions) => clientApi.upload<T>(path, form, await options(opts)),
};
