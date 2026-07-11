import Nav from "@/components/custom/Nav";
import Footer from "@/components/custom/Footer";
import ScrollReveal from "@/app/home/_components/ScrollReveal";
import CourseCard from "./_components/CourseCard";
import Timetable from "./_components/Timetable";
import { api } from "@/lib/api";
import type { ApiList, PublicCourse, PublicUpcomingSession } from "@/lib/types";

export const metadata = { title: "Classes & Timetable · LMS" };

// Public marketing page — no cookies forwarded, both calls hit unauthenticated
// endpoints (`/classes/public`, `/timetable/public/upcoming`). A transient
// backend hiccup degrades to an empty state per section rather than a full
// page crash — there's no session to retry against on a public page.
async function fetchCourses(): Promise<PublicCourse[]> {
  try {
    return (await api.get<ApiList<PublicCourse>>("/classes/public")).data;
  } catch {
    return [];
  }
}

async function fetchUpcoming(): Promise<PublicUpcomingSession[]> {
  try {
    return (await api.get<ApiList<PublicUpcomingSession>>("/timetable/public/upcoming")).data;
  } catch {
    return [];
  }
}

export default async function CoursesPage() {
  const [courses, upcoming] = await Promise.all([fetchCourses(), fetchUpcoming()]);

  return (
    <>
      <Nav />

      <section className="px-6 py-16 text-center sm:py-24">
        <ScrollReveal className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-medium text-foreground sm:text-4xl">Our classes</h1>
          <p className="mt-4 text-muted-foreground">
            Every class we run, taught by our teachers — pick one and register to join.
          </p>
        </ScrollReveal>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        {courses.length === 0 ? (
          <p className="text-center text-muted-foreground">No classes are open right now — check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, i) => (
              <ScrollReveal key={course.id} delay={Math.min(i * 0.08, 0.4)} className="h-full">
                <CourseCard course={course} />
              </ScrollReveal>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-border bg-muted/40 px-6 py-24 sm:py-32">
        <ScrollReveal className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-2xl font-medium text-foreground sm:text-3xl">Upcoming timetable</h2>
          <p className="mt-3 text-muted-foreground">
            Every session across every class, over the next two weeks.
          </p>
        </ScrollReveal>

        <Timetable sessions={upcoming} />
      </section>

      <Footer />
    </>
  );
}
