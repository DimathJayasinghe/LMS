import { CalendarCheck, CreditCard, PlayCircle, GraduationCap } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const STEPS = [
  {
    icon: <CalendarCheck className="size-5" aria-hidden />,
    title: "Browse & register",
    description: "Find your class from the current list and sign up in a couple of minutes.",
  },
  {
    icon: <CreditCard className="size-5" aria-hidden />,
    title: "Pay securely",
    description: "Settle the monthly fee online — access unlocks automatically once it clears.",
  },
  {
    icon: <PlayCircle className="size-5" aria-hidden />,
    title: "Join live, or watch later",
    description: "Attend the live session, or catch the recording whenever suits you.",
  },
  {
    icon: <GraduationCap className="size-5" aria-hidden />,
    title: "Sit exams & track results",
    description: "Exams, marks, and attendance all land in the same account, automatically.",
  },
];

export default function HowItWorks() {
  return (
    <section className="z-40 mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <ScrollReveal className="text-center">
        <h2 className="text-3xl font-medium text-foreground sm:text-4xl">How it works</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          From sign-up to results, in four steps.
        </p>
      </ScrollReveal>

      <div className="relative mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {/* Connecting line — desktop only, sits behind the numbered dots. */}
        <div
          aria-hidden
          className="absolute top-6 left-0 hidden h-px w-full bg-border lg:block"
        />

        {STEPS.map((step, i) => (
          <ScrollReveal key={step.title} delay={i * 0.12} className="h-full">
            <div className="relative flex h-full flex-col items-start">
              <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-primary">
                {step.icon}
              </span>
              <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground">
                STEP {i + 1}
              </p>
              <h3 className="mt-1 text-lg font-medium text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
