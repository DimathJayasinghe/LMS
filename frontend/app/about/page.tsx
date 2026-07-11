import { GraduationCap, ShieldCheck, Video } from "lucide-react";
import Nav from "@/components/custom/Nav";
import Footer from "@/components/custom/Footer";
import ScrollReveal from "@/app/home/_components/ScrollReveal";
import FeatureCard from "@/app/home/_components/FeatureCard";

export const metadata = { title: "About us · LMS" };

const POINTS = [
  {
    icon: <GraduationCap className="size-6" aria-hidden />,
    title: "1,200+ students",
    description: "Trusted by students across our A/L programmes, year after year.",
  },
  {
    icon: <Video className="size-6" aria-hidden />,
    title: "Live & recorded",
    description: "Teaching designed to work whether you're in the room or joining online.",
  },
  {
    icon: <ShieldCheck className="size-6" aria-hidden />,
    title: "Built for one institute",
    description: "One platform for classes, exams, attendance, and payments — nothing bolted on.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Nav />

      <section className="px-6 py-16 text-center sm:py-24">
        <ScrollReveal className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-medium text-foreground sm:text-4xl">About us</h1>
          <p className="mt-4 text-muted-foreground">
            Live and recorded classes, exams, and results for our students — all in one
            place, from anywhere.
          </p>
        </ScrollReveal>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {POINTS.map((point, i) => (
            <ScrollReveal key={point.title} delay={i * 0.1} className="h-full">
              <FeatureCard {...point} />
            </ScrollReveal>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
