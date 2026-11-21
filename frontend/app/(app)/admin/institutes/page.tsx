import { requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { InstituteManager } from "./_components/InstituteManager";
import { api } from "@/lib/api-server";
import type { ApiList, Institute } from "@/lib/types";

export const metadata = { title: "Institutes · LMS" };

export default async function AdminInstitutesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const sp = await searchParams;

  const viewer = await requireUser(cookie);
  // The center allowlist is SUPER_ADMIN-only — stricter than /admin/users.
  if (viewer.role !== "SUPER_ADMIN") redirect("/dashboard");

  const search = sp.search?.trim() ?? "";
  const query = search ? `?search=${encodeURIComponent(search)}` : "";

  const res = await api
    .get<ApiList<Institute>>(`/institutes${query}`, { cookie })
    .catch(() => ({ data: [] as Institute[], count: 0 }) as ApiList<Institute>);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Institutes" description="Manage physical centers and their codes." />
      <InstituteManager institutes={res.data} search={search} />
    </div>
  );
}
