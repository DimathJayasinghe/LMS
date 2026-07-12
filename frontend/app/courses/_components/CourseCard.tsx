import Image from "next/image";
import Link from "next/link";
import { Clock, User } from "lucide-react";
import type { PublicCourse } from "@/lib/types";

/**
 * Public course tile for the `/courses` marketing page. Real data (unlike
 * the old landing-page placeholder grid this replaces) — one card per
 * active `Course`, fetched unauthenticated from `GET /classes/public`.
 */
export default function CourseCard({ course }: { course: PublicCourse }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition hover:border-foreground/40 hover:shadow-xl">
      {course.bannerUrl ? (
        <Image
          src={course.bannerUrl}
          alt={course.name}
          width={800}
          height={450}
          className="h-40 w-full object-cover"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-primary/10 text-primary">
          <span className="text-sm font-medium">{course.subject.name}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col p-6">
        <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {course.subject.name} · {course.year}
        </span>

        <h3 className="mt-3 text-lg font-medium text-foreground">{course.name}</h3>

        {course.description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
        )}

        <div className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
          <User className="size-4" aria-hidden />
          {course.teacher.name}
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          Rs. {Number(course.monthlyFee).toLocaleString()} / month
        </div>

        <Link
          href="/auth/signup"
          className="mt-6 inline-block rounded-full border border-border p-2 text-center text-foreground transition-colors duration-100 hover:bg-foreground hover:text-background"
        >
          Register to join
        </Link>
      </div>
    </article>
  );
}
