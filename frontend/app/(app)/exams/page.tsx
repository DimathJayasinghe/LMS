import { requireUser } from "@/lib/session";
import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/custom/PageHeader";
import { Button } from "@/components/ui/button";
import ExamCard, { type ExamCardState } from "./_components/ExamCard";
import { api } from "@/lib/api-server";
import { cn } from "@/lib/utils";
import type { ApiList, Course, Exam, MySubmission } from "@/lib/types";

export const metadata = { title: "Exams · LMS" };

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Open now" },
  { value: "ended", label: "Closed" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { status } = await searchParams;
  const active: StatusFilter = STATUS_FILTERS.some((f) => f.value === status)
    ? (status as StatusFilter)
    : "all";
  const query = active === "all" ? "" : `?status=${active}`;

  const [me, examList, courseList] = await Promise.all([
    requireUser(cookie),
    api.get<ApiList<Exam>>(`/exams${query}`, { cookie }),
    api.get<ApiList<Course>>("/classes", { cookie }),
  ]);
  const user = me;
  const exams = examList.data;
  const courses = courseList.data;

  // Exams carry only `courseId`; resolve names from the course list.
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const isStaff = user.role === "TEACHER" || user.role === "SUPER_ADMIN";

  // A student's submissions drive the per-card hint (non-fatal).
  const stateByExam = new Map<string, ExamCardState>();
  if (user.role === "STUDENT") {
    try {
      const mine = await api.get<ApiList<MySubmission>>("/submissions/mine", { cookie });
      for (const s of mine.data) {
        stateByExam.set(s.examId, s.published ? "result" : "submitted");
      }
    } catch {
      // Leave hints off if submissions can't be loaded.
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Exams"
        description={isStaff ? "Create and manage exams." : "Sit exams and view your results."}
        action={
          isStaff ? (
            <Button asChild>
              <Link href="/exams/new">
                <Plus aria-hidden />
                New exam
              </Link>
            </Button>
          ) : undefined
        }
      />

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Filter exams by status">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/exams" : `/exams?status=${f.value}`}
            aria-current={active === f.value ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              active === f.value
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          {active === "all" ? "No exams yet." : "No exams match this filter."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              courseName={courseName.get(exam.courseId)}
              state={user.role === "STUDENT" ? stateByExam.get(exam.id) ?? "none" : "none"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
