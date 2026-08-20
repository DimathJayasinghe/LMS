import Link from "next/link";
import { ArrowRight, BadgeCheck, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Course } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface ClassCardProps {
  course: Course;
  /** Resolved subject name (the API returns only `subjectId`). */
  subjectName?: string;
  /** Whether the viewing student already holds an active enrollment. */
  enrolled?: boolean;
  newLessonCount?: number;
  nextSessionAt?: string | null;
}

/**
 * A single course tile in the authenticated `/classes` browse grid. Links to the
 * course detail page. Uses design tokens throughout; the banner falls back to a
 * neutral tile when a course has no `bannerUrl`.
 */
export default function ClassCard({
  course,
  subjectName,
  enrolled,
  newLessonCount = 0,
  nextSessionAt,
}: ClassCardProps) {
  return (
    <Link
      href={`/classes/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition hover:border-foreground/40 hover:shadow-md"
    >
      <div
        className="relative flex h-32 items-center justify-center bg-muted"
        style={
          course.bannerUrl
            ? {
                backgroundImage: `url(${course.bannerUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {!course.bannerUrl && (
          <BookOpen className="size-8 text-muted-foreground" aria-hidden />
        )}
        {enrolled && (
          <Badge className="absolute right-2 top-2 gap-1" variant="default">
            <BadgeCheck className="size-3" aria-hidden />
            Enrolled
          </Badge>
        )}
        {newLessonCount > 0 && (
          <Badge className="absolute left-2 top-2" variant="destructive">
            {newLessonCount} new {newLessonCount === 1 ? "lesson" : "lessons"}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          {subjectName && (
            <Badge variant="secondary" className="font-normal">
              {subjectName}
            </Badge>
          )}
          {course.year != null && (
            <span className="text-xs text-muted-foreground">{course.year}</span>
          )}
        </div>

        <h3 className="font-medium text-foreground">{course.name}</h3>

        {course.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
        )}

        {nextSessionAt && (
          <p className="text-xs text-muted-foreground">
            Next session {new Intl.DateTimeFormat("en-LK", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Colombo",
            }).format(new Date(nextSessionAt))}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-sm font-medium text-foreground">
            {formatCurrency(course.monthlyFee)}
            <span className="text-xs font-normal text-muted-foreground"> / month</span>
          </span>
          <ArrowRight
            className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}
