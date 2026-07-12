import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { SubjectManager } from "./_components/SubjectManager";
import { api } from "@/lib/api";
import type { ApiList, ApiSuccess, Subject, User } from "@/lib/types";

export const metadata = { title: "Subjects · LMS" };

export default async function AdminSubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const sp = await searchParams;

  let viewer: User;
  try {
    viewer = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }
  // Academic taxonomy is SUPER_ADMIN-only — stricter than /admin/users.
  if (viewer.role !== "SUPER_ADMIN") redirect("/dashboard");

  const search = sp.search?.trim() ?? "";
  const query = search ? `?search=${encodeURIComponent(search)}` : "";

  const res = await api
    .get<ApiList<Subject>>(`/subjects${query}`, { cookie })
    .catch(() => ({ data: [] as Subject[], count: 0 }) as ApiList<Subject>);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Subjects" description="Manage subjects and their courses." />
      <SubjectManager subjects={res.data} search={search} />
    </div>
  );
}
