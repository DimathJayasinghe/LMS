import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Nav from "@/components/custom/Nav";
import Footer from "@/components/custom/Footer";
import Grid from "./_components/Grid";
import StudentReviews from "./_components/StudentReviews";
import Header from "./_components/Header";
import CourseCard, { type CourseCardData } from "./_components/CourseCard";

// Sample tiles for the marketing grid. Real courses are fetched on /courses.
const SAMPLE_COURSES: CourseCardData[] = Array.from({ length: 9 }, (_, i) => ({
  title: `Advanced Level Physics ${2026 + (i % 3)}`,
  year: `${2026 + (i % 3)} A/L`,
  schedule: "Monday · 3.00PM – 5.00PM",
  image: "/Courses/1.png",
  href: "/courses",
}));

export default function Home() {
  return (
    <>
      <main>
        <Grid />
        <Nav />
        <StudentReviews />
        <Header />
      </main>

      <section className="z-40 mt-60 min-h-[400px] border-t border-border bg-muted/40 p-10 pt-40">
        <h2 className="text-center text-5xl font-medium text-foreground">
          Discover Classes
        </h2>
        <p className="m-auto mt-4 max-w-[50rem] text-center italic leading-7 text-muted-foreground">
          Find the best classes you want to join based on your interests, career
          goals, and skills you want to improve. Choose classes that are useful,
          engaging, and helpful for your future development.
        </p>

        <div className="m-auto mt-10 flex w-full max-w-[75rem] flex-wrap justify-center gap-10">
          {SAMPLE_COURSES.map((course, i) => (
            <CourseCard key={i} course={course} />
          ))}
        </div>

        <Link
          href="/courses"
          className="relative m-auto mb-10 mt-10 flex w-fit items-center gap-3 rounded-full bg-primary px-10 py-5 text-lg text-primary-foreground transition duration-300 hover:scale-110 motion-reduce:hover:scale-100"
        >
          All classes
          <ArrowRight className="size-5" aria-hidden />
        </Link>
      </section>

      <Footer />
    </>
  );
}
