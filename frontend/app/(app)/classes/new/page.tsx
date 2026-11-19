import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { CourseForm } from "../_components/CourseForm";
import { api } from "@/lib/api";
import type { AcademicStaff, ApiList, ApiSuccess, Subject, SubjectTeacherAssignment, User } from "@/lib/types";

export default async function NewClassPage() {
  const cookie = (await cookies()).toString();
  let viewer: User;
  try {
    viewer = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }
  if (viewer.role !== "TEACHER" && viewer.role !== "SUPER_ADMIN") redirect("/classes");

  const subjectPath = viewer.role === "TEACHER" ? "/subjects/mine" : "/subjects";
  const subjects = (await api.get<ApiList<Subject>>(subjectPath, { cookie })).data;
  let teachers: AcademicStaff[] = [];
  const allowedTeacherIdsBySubject: Record<string, string[]> = {};

  if (viewer.role === "SUPER_ADMIN") {
    teachers = (await api.get<ApiList<AcademicStaff>>("/users/academic-staff?role=TEACHER", { cookie })).data;
    const assignments = await Promise.all(
      subjects.map((subject) =>
        api.get<ApiList<SubjectTeacherAssignment>>(`/subjects/${subject.id}/teachers`, { cookie }),
      ),
    );
    subjects.forEach((subject, index) => {
      allowedTeacherIdsBySubject[subject.id] = assignments[index]!.data.map((item) => item.teacherId);
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New class" description="Create a class inside one of your assigned subjects." />
      <CourseForm viewerRole={viewer.role} subjects={subjects} teachers={teachers} allowedTeacherIdsBySubject={allowedTeacherIdsBySubject} />
    </div>
  );
}
