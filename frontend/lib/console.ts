import { unstable_rethrow } from "next/navigation";
import { api } from "@/lib/api-server";
import { guard401 } from "@/lib/session";
import type { ApiSuccess, MethodTotal } from "@/lib/types";

export type PanelResult<T> = { ok: true; data: T } | { ok: false };

/** One panel's read. A failure is that panel's alone: only a lost session or a redirect leaves it. */
export async function loadPanel<T>(path: string, cookie: string): Promise<PanelResult<T>> {
  try {
    return { ok: true, data: (await guard401(api.get<ApiSuccess<T>>(path, { cookie }))).data };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false };
  }
}

export const METHOD_LABELS: Record<MethodTotal["method"], string> = {
  ENTRANCE: "At the desk",
  ONLINE: "Online (PayHere)",
  BULK: "Bulk import",
  MANUAL: "Owner adjustment",
};
