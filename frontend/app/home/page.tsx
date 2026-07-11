import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Nav from "@/components/custom/Nav";
import Footer from "@/components/custom/Footer";
import Grid from "./_components/Grid";
import StudentReviews from "./_components/StudentReviews";
import Header from "./_components/Header";
import FadeIn from "./_components/FadeIn";
import Features from "./_components/Features";
import Marquee from "./_components/Marquee";
import HowItWorks from "./_components/HowItWorks";
import Magnetic from "./_components/Magnetic";
import ScrollReveal from "./_components/ScrollReveal";

export default function Home() {
  return (
    <>
      {/* `relative` gives Grid's `absolute` backdrop a defined containing
          block, instead of falling back to the nearest positioned ancestor
          up the tree (fragile — see Grid.tsx for the stacking-context note). */}
      <main className="relative overflow-hidden">
        <Grid />
        <Nav />
        <FadeIn>
          <StudentReviews />
        </FadeIn>
        <FadeIn delay={0.1}>
          <Header />
        </FadeIn>
      </main>

      <Features />
      <Marquee />
      <HowItWorks />

      <section className="z-40 border-t border-border bg-muted/40 px-6 py-24 text-center sm:py-32">
        <ScrollReveal className="mx-auto flex max-w-2xl flex-col items-center">
          <h2 className="text-2xl font-medium text-foreground sm:text-3xl">
            Ready to get started?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Browse our current classes and find the one that fits your goals.
          </p>
          <Magnetic>
            <Link
              href="/courses"
              className="mt-10 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-primary-foreground transition hover:opacity-90"
            >
              Browse classes
              <ArrowRight className="size-5" aria-hidden />
            </Link>
          </Magnetic>
        </ScrollReveal>
      </section>

      <Footer />
    </>
  );
}
