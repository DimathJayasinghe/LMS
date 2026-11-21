import { requireUser } from "@/lib/session";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { SubjectTeacherManager } from "./_components/SubjectTeacherManager";
import { api } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import type { AcademicStaff, ApiList, ApiSuccess, Subject, SubjectTeacherAssignment } from "@/lib/types";

export default async function SubjectTeachersPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const cookie = (await cookies()).toString();
  const { subjectId } = await params;
  const viewer = await requireUser(cookie);
  if (viewer.role !== "SUPER_ADMIN") redirect("/dashboard");

  let subject: Subject;
  try {
    subject = (await api.get<ApiSuccess<Subject>>(`/subjects/${subjectId}`, { cookie })).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const [teachers, assignments] = await Promise.all([
    api.get<ApiList<AcademicStaff>>("/users/academic-staff?role=TEACHER", { cookie }),
    api.get<ApiList<SubjectTeacherAssignment>>(`/subjects/${subjectId}/teachers`, { cookie }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/subjects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />Subjects
      </Link>
      <PageHeader title={`${subject.name} teachers`} description="Control which teachers may create and manage classes in this subject." />
      <SubjectTeacherManager subjectId={subjectId} teachers={teachers.data} assignments={assignments.data} />
    </div>
  );
}
