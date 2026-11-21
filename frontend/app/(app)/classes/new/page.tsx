import { guard401, requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { CourseForm } from "../_components/CourseForm";
import { api } from "@/lib/api-server";
import type { AcademicStaff, ApiList, Subject, SubjectTeacherAssignment } from "@/lib/types";

export default async function NewClassPage() {
  const cookie = (await cookies()).toString();
  const viewer = await requireUser(cookie);
  if (viewer.role !== "TEACHER" && viewer.role !== "SUPER_ADMIN") redirect("/classes");

  const subjectPath = viewer.role === "TEACHER" ? "/subjects/mine" : "/subjects";
  const subjects = (await guard401(api.get<ApiList<Subject>>(subjectPath, { cookie }))).data;
  let teachers: AcademicStaff[] = [];
  const allowedTeacherIdsBySubject: Record<string, string[]> = {};

  if (viewer.role === "SUPER_ADMIN") {
    teachers = (await guard401(api.get<ApiList<AcademicStaff>>("/users/academic-staff?role=TEACHER", { cookie }))).data;
    const assignments = await Promise.all(
      subjects.map((subject) =>
        guard401(api.get<ApiList<SubjectTeacherAssignment>>(`/subjects/${subject.id}/teachers`, { cookie })),
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
