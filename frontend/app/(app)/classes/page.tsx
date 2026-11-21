import { unstable_rethrow } from "next/navigation";
import { guard401, requireUser } from "@/lib/session";
import { cookies } from "next/headers";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import ClassCard from "./_components/ClassCard";
import { api } from "@/lib/api-server";
import type {
  ApiList,
  Course,
  LearningEnrollment,
  Subject,
} from "@/lib/types";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { search } = await searchParams;
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";

  const [me, classList, subjectList] = await Promise.all([
    requireUser(cookie),
    guard401(api.get<ApiList<Course>>(`/classes${query}`, { cookie })),
    guard401(api.get<ApiList<Subject>>("/subjects", { cookie })),
  ]);
  const user = me;
  const courses = classList.data;
  const subjects = subjectList.data;

  // Resolve subject names client-side — the class payload carries only subjectId.
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  // A student's active enrollments drive the "Enrolled" badges (non-fatal).
  let learningByCourse = new Map<string, LearningEnrollment["learning"]>();
  if (user.role === "STUDENT") {
    try {
      const mine = await guard401(api.get<ApiList<LearningEnrollment>>("/enrollments/learning", { cookie }));
      learningByCourse = new Map(mine.data.map((e) => [e.courseId, e.learning]));
    } catch (error) {
      unstable_rethrow(error);
      // Leave badges off if enrollments can't be loaded.
    }
  }

  const enrolledCourseIds = new Set(learningByCourse.keys());
  const currentCourses = courses.filter((course) => enrolledCourseIds.has(course.id));
  const availableCourses = user.role === "STUDENT"
    ? courses.filter((course) => !enrolledCourseIds.has(course.id))
    : courses;
  const isTeacherStaff = user.role === "TEACHER" || user.role === "SUPER_ADMIN";

  const cards = (items: Course[]) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((course) => {
        const learning = learningByCourse.get(course.id);
        return (
          <ClassCard
            key={course.id}
            course={course}
            subjectName={subjectName.get(course.subjectId)}
            enrolled={enrolledCourseIds.has(course.id)}
            newLessonCount={learning?.newLessonCount}
            nextSessionAt={learning?.nextSessionAt}
          />
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={user.role === "TEACHER" ? "My classes" : "Classes"}
        description={
          user.role === "TEACHER"
            ? "Create and manage only the classes assigned to you."
            : user.role === "STUDENT"
              ? "Continue enrolled classes, see new lessons, or explore more."
              : "Manage classes across the institution."
        }
        action={isTeacherStaff ? <Button asChild><Link href="/classes/new">New class</Link></Button> : undefined}
      />

      <form method="GET" className="mb-6 flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="search"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Search classes…"
            className="pl-9"
            aria-label="Search classes"
          />
        </div>
      </form>

      {user.role === "STUDENT" && (
        <section className="mb-8" aria-labelledby="current-classes-title">
          <h2 id="current-classes-title" className="mb-3 text-lg font-semibold text-foreground">My current classes</h2>
          {currentCourses.length > 0 ? cards(currentCourses) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              You are not currently enrolled in any classes.
            </div>
          )}
        </section>
      )}

      {user.role === "STUDENT" && (
        <h2 className="mb-3 text-lg font-semibold text-foreground">Explore more classes</h2>
      )}

      {availableCourses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          {search
            ? `No classes match “${search}”.`
            : user.role === "STUDENT" && currentCourses.length > 0
              ? "You are enrolled in every available class."
              : "No classes are available yet."}
        </div>
      ) : (
        cards(availableCourses)
      )}
    </div>
  );
}
