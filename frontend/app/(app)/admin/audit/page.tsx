import { requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { AuditFilters } from "./_components/AuditFilters";
import { AuditLogTable } from "./_components/AuditLogTable";
import { api } from "@/lib/api-server";
import type { ApiList, AuditLogEntry } from "@/lib/types";

export const metadata = { title: "Audit Log · LMS" };

const PAGE_SIZE = 20;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; from?: string; to?: string; page?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const sp = await searchParams;

  const viewer = await requireUser(cookie);
  // Audit logs contain IPs, user-agents, and every privileged mutation's
  // before/after state — super-admin only (see the 2026-07-10 role-guard fix,
  // the route used to be gated to front-desk ADMIN by mistake).
  if (viewer.role !== "SUPER_ADMIN") redirect("/dashboard");

  const page = Math.max(1, Number(sp.page) || 1);

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (sp.action) query.set("action", sp.action);
  if (sp.from) query.set("from", sp.from);
  if (sp.to) query.set("to", sp.to);

  const res = await api
    .get<ApiList<AuditLogEntry>>(`/audit-logs?${query.toString()}`, { cookie })
    .catch(() => ({ data: [] as AuditLogEntry[], count: 0 }) as ApiList<AuditLogEntry>);

  const total = res.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number): string => {
    const q = new URLSearchParams();
    if (sp.action) q.set("action", sp.action);
    if (sp.from) q.set("from", sp.from);
    if (sp.to) q.set("to", sp.to);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Audit log"
        description="Every privileged mutation — who did what, when, and from where."
      />

      <AuditFilters action={sp.action ?? ""} from={sp.from ?? ""} to={sp.to ?? ""} />

      <AuditLogTable entries={res.data} />

      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} event{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted"
              >
                Next
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
