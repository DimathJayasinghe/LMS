import { guard401, requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { UserFilters } from "./_components/UserFilters";
import { UsersTable } from "./_components/UsersTable";
import { api } from "@/lib/api-server";
import type { ApiList, Role, User } from "@/lib/types";

export const metadata = { title: "Users · LMS" };

const PAGE_SIZE = 20;
const ROLES: Role[] = ["SUPER_ADMIN", "TEACHER", "ADMIN", "MARKER", "STUDENT"];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; role?: string; status?: string; page?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const sp = await searchParams;

  const viewer = await requireUser(cookie);
  if (viewer.role !== "SUPER_ADMIN" && viewer.role !== "ADMIN") redirect("/dashboard");

  const page = Math.max(1, Number(sp.page) || 1);
  const role = ROLES.includes(sp.role as Role) ? (sp.role as Role) : undefined;
  const status = ["active", "inactive", "all"].includes(sp.status ?? "")
    ? (sp.status as string)
    : "active";

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), status });
  if (sp.search) query.set("search", sp.search);
  if (role) query.set("role", role);

  const res = await guard401(api
    .get<ApiList<User>>(`/users?${query.toString()}`, { cookie }))
    .catch((error) => { unstable_rethrow(error); return ({ data: [] as User[], count: 0 }) as ApiList<User>; });

  const total = res.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Preserve current filters when moving pages.
  const pageHref = (p: number): string => {
    const q = new URLSearchParams();
    if (sp.search) q.set("search", sp.search);
    if (role) q.set("role", role);
    if (status !== "active") q.set("status", status);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Users" description="Manage accounts, roles, and entrance codes." />

      <UserFilters search={sp.search ?? ""} role={role ?? "all"} status={status} roles={ROLES} />

      <UsersTable
        users={res.data}
        canChangeRole={viewer.role === "SUPER_ADMIN"}
        viewerId={viewer.id}
        viewerRole={viewer.role}
        roles={ROLES}
      />

      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} user{total === 1 ? "" : "s"} · page {page} of {totalPages}
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
