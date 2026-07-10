import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";

export interface CourseCardData {
  /** Course title as shown on the card. */
  title: string;
  /** Exam year / grade label rendered on the corner ribbon (e.g. "2027 A/L"). */
  year: string;
  /** Human-readable weekly schedule (e.g. "Monday · 3.00PM – 5.00PM"). */
  schedule: string;
  /** Cover image under /public. */
  image: string;
  /** Where the "View class" button links to. */
  href: string;
}

/**
 * A single course tile for the "Discover Classes" grid on the landing page.
 * Presentational only — real course data is fetched on the /courses route later
 * (see context/frontend/06-frontend-roadmap.md). Uses design tokens throughout
 * so it survives dark mode; the teal ribbon is the one intentional accent from
 * the design language (context/frontend/01-design-language.md §restrained color).
 */
export default function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <article className="group relative flex w-full max-w-sm flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition hover:border-foreground/40 hover:shadow-xl">
      <Image
        src={course.image}
        alt={course.title}
        width={800}
        height={800}
        className="m-auto mt-2 h-60 w-[95%] rounded-2xl object-cover"
      />

      {/* Corner year ribbon — the signature teal accent. */}
      <div
        className="absolute left-0 top-0 h-20 w-40 bg-teal-600 p-5 font-bold text-white"
        style={{ clipPath: "polygon(30% 0, 100% 0, 0 100%, 0 30%)" }}
      >
        <span className="block -translate-x-3 -translate-y-3 -rotate-[25deg]">
          {course.year}
        </span>
      </div>

      <h3 className="m-2 text-lg font-medium text-foreground">{course.title}</h3>

      <div className="flex items-center">
        <Clock className="m-2 size-5 text-muted-foreground" aria-hidden />
        <span className="text-sm text-muted-foreground">{course.schedule}</span>
      </div>

      <Link
        href={course.href}
        className="m-2 mt-10 inline-block w-[95%] rounded-2xl border border-border bg-card p-2 text-center text-foreground transition-colors duration-100 hover:bg-foreground hover:text-background"
      >
        View class
      </Link>
    </article>
  );
}
