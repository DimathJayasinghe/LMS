import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { SessionForm } from "./_components/SessionForm";
import { api } from "@/lib/api";
import type { ApiSuccess, User } from "@/lib/types";

export const metadata = { title: "New session · LMS" };

export default async function NewSessionPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { classId } = await params;

  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }
  if (user.role !== "TEACHER" && user.role !== "SUPER_ADMIN") redirect(`/classes/${classId}`);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/classes/${classId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to class
      </Link>

      <PageHeader title="New session" description="Schedule a class occurrence." />
      <SessionForm classId={classId} />
    </div>
  );
}
