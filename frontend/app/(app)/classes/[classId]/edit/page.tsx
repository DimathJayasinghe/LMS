import { guard401, requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { CourseForm } from "../../_components/CourseForm";
import { api } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import type { AcademicStaff, ApiList, ApiSuccess, Course, Subject, SubjectTeacherAssignment } from "@/lib/types";

export default async function EditClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const cookie = (await cookies()).toString();
  const { classId } = await params;
  const viewer = await requireUser(cookie);
  if (viewer.role !== "TEACHER" && viewer.role !== "SUPER_ADMIN") redirect(`/classes/${classId}`);

  let course: Course;
  try {
    course = (await guard401(api.get<ApiSuccess<Course>>(`/classes/${classId}`, { cookie }))).data;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const subjectPath = viewer.role === "TEACHER" ? "/subjects/mine" : "/subjects";
  const subjects = (await guard401(api.get<ApiList<Subject>>(subjectPath, { cookie }))).data;
  let teachers: AcademicStaff[] = [];
  const allowedTeacherIdsBySubject: Record<string, string[]> = {};
  if (viewer.role === "SUPER_ADMIN") {
    teachers = (await guard401(api.get<ApiList<AcademicStaff>>("/users/academic-staff?role=TEACHER", { cookie }))).data;
    const assignments = await Promise.all(
      subjects.map((subject) => guard401(api.get<ApiList<SubjectTeacherAssignment>>(`/subjects/${subject.id}/teachers`, { cookie }))),
    );
    subjects.forEach((subject, index) => {
      allowedTeacherIdsBySubject[subject.id] = assignments[index]!.data.map((item) => item.teacherId);
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${course.name}`} description="Update class details and ownership." />
      <CourseForm viewerRole={viewer.role} subjects={subjects} teachers={teachers} allowedTeacherIdsBySubject={allowedTeacherIdsBySubject} course={course} />
    </div>
  );
}
