import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { ExamForm } from "./_components/ExamForm";
import { api } from "@/lib/api";
import type { ApiList, ApiSuccess, Course, User } from "@/lib/types";

export const metadata = { title: "New exam · LMS" };

export default async function NewExamPage() {
  const cookie = (await cookies()).toString();

  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }
  if (user.role !== "TEACHER" && user.role !== "SUPER_ADMIN") redirect("/exams");

  const courses = await api
    .get<ApiList<Course>>("/classes", { cookie })
    .then((r) => r.data)
    .catch(() => [] as Course[]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/exams"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All exams
      </Link>

      <PageHeader title="New exam" description="Set the window, marks, and questions." />

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          You need a course before creating an exam.
        </div>
      ) : (
        <ExamForm courses={courses} />
      )}
    </div>
  );
}
