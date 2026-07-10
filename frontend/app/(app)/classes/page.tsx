import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { Input } from "@/components/ui/input";
import ClassCard from "./_components/ClassCard";
import { api } from "@/lib/api";
import type {
  ApiList,
  ApiSuccess,
  Course,
  Enrollment,
  Subject,
  User,
} from "@/lib/types";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { search } = await searchParams;
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";

  let user: User;
  let courses: Course[];
  let subjects: Subject[];
  try {
    const [me, classList, subjectList] = await Promise.all([
      api.get<ApiSuccess<User>>("/auth/me", { cookie }),
      api.get<ApiList<Course>>(`/classes${query}`, { cookie }),
      api.get<ApiList<Subject>>("/subjects", { cookie }),
    ]);
    user = me.data;
    courses = classList.data;
    subjects = subjectList.data;
  } catch {
    redirect("/auth/login");
  }

  // Resolve subject names client-side — the class payload carries only subjectId.
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

  // A student's active enrollments drive the "Enrolled" badges (non-fatal).
  let enrolledCourseIds = new Set<string>();
  if (user.role === "STUDENT") {
    try {
      const mine = await api.get<ApiList<Enrollment>>(
        "/enrollments/my?isActive=true",
        { cookie },
      );
      enrolledCourseIds = new Set(mine.data.map((e) => e.courseId));
    } catch {
      // Leave badges off if enrollments can't be loaded.
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Classes"
        description="Browse available classes and enroll."
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

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          {search
            ? `No classes match “${search}”.`
            : "No classes are available yet."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <ClassCard
              key={course.id}
              course={course}
              subjectName={subjectName.get(course.subjectId)}
              enrolled={enrolledCourseIds.has(course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
