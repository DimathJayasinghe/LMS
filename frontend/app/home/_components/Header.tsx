import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Magnetic from "./Magnetic";
import AnimatedWord from "./AnimatedWord";

const CYCLE_WORDS = ["learn.", "attend classes.", "sit exams.", "track results."];

// Matches the pill treatment already used by Nav's logo/login and the
// "All classes" CTA — the site's one real button language, not a
// component-library default that happens to clash with it.
function ButtonRegister() {
  return (
    <Magnetic>
      <Link
        href="/auth/signup"
        className="mt-12 inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-4 text-base font-medium text-background transition hover:opacity-90 sm:px-10 sm:py-5 sm:text-lg"
      >
        Register to class
        <ArrowRight className="size-5" aria-hidden />
      </Link>
    </Magnetic>
  );
}

export default function Header() {
  return (
    <div className="relative z-50 m-auto flex max-w-[90vw] select-none flex-col items-center px-6 py-16 text-center text-foreground sm:py-20">
      <h1 className="min-h-[2.4em] text-4xl leading-tight sm:min-h-[2.2em] sm:text-5xl sm:leading-tight md:text-6xl md:leading-none lg:text-7xl">
        Everything you need to <br />
        <AnimatedWord
          words={CYCLE_WORDS}
          className="text-primary leading-[inherit] tracking-normal"
        />
      </h1>
      <p className="mt-6 max-w-md text-sm text-muted-foreground sm:mt-8 sm:text-base">
        Live and recorded classes, exams, and results — all in one place, from
        anywhere.
      </p>
      <ButtonRegister />
    </div>
  );
}
