import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/custom/PageHeader";
import { CourseForm } from "../../_components/CourseForm";
import { api, ApiError } from "@/lib/api";
import type { AcademicStaff, ApiList, ApiSuccess, Course, Subject, SubjectTeacherAssignment, User } from "@/lib/types";

export default async function EditClassPage({ params }: { params: Promise<{ classId: string }> }) {
  const cookie = (await cookies()).toString();
  const { classId } = await params;
  let viewer: User;
  try {
    viewer = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }
  if (viewer.role !== "TEACHER" && viewer.role !== "SUPER_ADMIN") redirect(`/classes/${classId}`);

  let course: Course;
  try {
    course = (await api.get<ApiSuccess<Course>>(`/classes/${classId}`, { cookie })).data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const subjectPath = viewer.role === "TEACHER" ? "/subjects/mine" : "/subjects";
  const subjects = (await api.get<ApiList<Subject>>(subjectPath, { cookie })).data;
  let teachers: AcademicStaff[] = [];
  const allowedTeacherIdsBySubject: Record<string, string[]> = {};
  if (viewer.role === "SUPER_ADMIN") {
    teachers = (await api.get<ApiList<AcademicStaff>>("/users/academic-staff?role=TEACHER", { cookie })).data;
    const assignments = await Promise.all(
      subjects.map((subject) => api.get<ApiList<SubjectTeacherAssignment>>(`/subjects/${subject.id}/teachers`, { cookie })),
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
