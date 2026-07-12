import Link from "next/link";
import { Atom, FlaskConical, Calculator, Dna, Cpu, ArrowRight } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import TiltCard from "./TiltCard";

// Icons rendered here (server component) and passed down as elements — a
// component *reference* can't cross into a Client Component as a prop.
const SUBJECTS = [
  { icon: <Atom className="size-6" aria-hidden />, name: "Physics" },
  { icon: <FlaskConical className="size-6" aria-hidden />, name: "Chemistry" },
  { icon: <Calculator className="size-6" aria-hidden />, name: "Combined Maths" },
  { icon: <Dna className="size-6" aria-hidden />, name: "Biology" },
  { icon: <Cpu className="size-6" aria-hidden />, name: "ICT" },
];

export default function SubjectShowcase() {
  return (
    <section className="z-40 mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <ScrollReveal className="text-center">
        <h2 className="text-3xl font-medium text-foreground sm:text-4xl">Subjects we teach</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Pick a subject to see current classes, teachers, and the timetable.
        </p>
      </ScrollReveal>

      <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {SUBJECTS.map((subject, i) => (
          <ScrollReveal key={subject.name} delay={i * 0.08} className="h-full">
            <TiltCard>
              <Link
                href="/courses"
                className="flex h-full flex-col items-start p-6 focus-visible:outline-none"
              >
                <span className="relative flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {subject.icon}
                </span>
                <span className="relative mt-4 text-base font-medium text-foreground">
                  {subject.name}
                </span>
                <span className="relative mt-auto flex items-center gap-1 pt-4 text-xs text-muted-foreground">
                  View classes
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </Link>
            </TiltCard>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
