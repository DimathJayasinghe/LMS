import { CreditCard, ScanLine, Video, FileText } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import FeatureCard, { type FeatureCardData } from "./FeatureCard";

// Icons are rendered here (server component) and passed down as elements —
// a component *reference* can't cross into a Client Component as a prop.
const FEATURES: FeatureCardData[] = [
  {
    icon: <Video className="size-6" aria-hidden />,
    title: "Live & recorded classes",
    description: "Join live, or catch up anytime with recorded video — nothing missed.",
  },
  {
    icon: <FileText className="size-6" aria-hidden />,
    title: "Exams & results",
    description: "Sit exams online and get your marked results back in the same place.",
  },
  {
    icon: <ScanLine className="size-6" aria-hidden />,
    title: "Attendance tracking",
    description: "A quick QR scan at the door keeps your attendance record accurate.",
  },
  {
    icon: <CreditCard className="size-6" aria-hidden />,
    title: "Secure payments",
    description: "Pay for your classes online, safely, and track every payment made.",
  },
];

export default function Features() {
  return (
    <section className="z-40 mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <ScrollReveal className="text-center">
        <h2 className="text-3xl font-medium text-foreground sm:text-4xl">Everything in one place</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          One account for classes, exams, attendance, and payments.
        </p>
      </ScrollReveal>

      <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature, i) => (
          <ScrollReveal key={feature.title} delay={i * 0.1} className="h-full">
            <FeatureCard {...feature} />
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
