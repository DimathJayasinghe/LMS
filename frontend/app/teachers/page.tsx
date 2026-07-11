import { User } from "lucide-react";
import Nav from "@/components/custom/Nav";
import Footer from "@/components/custom/Footer";
import ScrollReveal from "@/app/home/_components/ScrollReveal";
import { api } from "@/lib/api";
import type { ApiList, PublicCourse } from "@/lib/types";

export const metadata = { title: "Teachers · LMS" };

interface Teacher {
  name: string;
  subjects: string[];
  courseCount: number;
}

// There's no dedicated teacher-profile data yet (no bio/photo in the
// schema) — this derives a real, honest list from the public course
// listing rather than showing fabricated content.
function groupByTeacher(courses: PublicCourse[]): Teacher[] {
  const byName = new Map<string, Teacher>();
  for (const course of courses) {
    const existing = byName.get(course.teacher.name);
    if (existing) {
      existing.courseCount += 1;
      if (!existing.subjects.includes(course.subject.name)) {
        existing.subjects.push(course.subject.name);
      }
    } else {
      byName.set(course.teacher.name, {
        name: course.teacher.name,
        subjects: [course.subject.name],
        courseCount: 1,
      });
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchTeachers(): Promise<Teacher[]> {
  try {
    const courses = (await api.get<ApiList<PublicCourse>>("/classes/public")).data;
    return groupByTeacher(courses);
  } catch {
    return [];
  }
}

export default async function TeachersPage() {
  const teachers = await fetchTeachers();

  return (
    <>
      <Nav />

      <section className="px-6 py-16 text-center sm:py-24">
        <ScrollReveal className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-medium text-foreground sm:text-4xl">Our teachers</h1>
          <p className="mt-4 text-muted-foreground">
            The people behind our classes.
          </p>
        </ScrollReveal>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        {teachers.length === 0 ? (
          <p className="text-center text-muted-foreground">No teachers to show right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((teacher, i) => (
              <ScrollReveal key={teacher.name} delay={Math.min(i * 0.08, 0.4)} className="h-full">
                <div className="flex h-full flex-col items-center rounded-2xl border border-border bg-card p-8 text-center text-card-foreground">
                  <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="size-6" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-medium text-foreground">{teacher.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {teacher.courseCount} {teacher.courseCount === 1 ? "class" : "classes"}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {teacher.subjects.map((subject) => (
                      <span
                        key={subject}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </>
  );
}
