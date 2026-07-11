import { Mail, MapPin, Phone } from "lucide-react";
import Nav from "@/components/custom/Nav";
import Footer from "@/components/custom/Footer";
import ScrollReveal from "@/app/home/_components/ScrollReveal";

export const metadata = { title: "Contact us · LMS" };

const CHANNELS = [
  {
    icon: Mail,
    label: "Email",
    value: "hello@lms.lk",
    href: "mailto:hello@lms.lk",
  },
  {
    icon: Phone,
    label: "Phone",
    value: "+94 11 234 5678",
    href: "tel:+94112345678",
  },
  {
    icon: MapPin,
    label: "Location",
    value: "Colombo, Sri Lanka",
    href: undefined,
  },
];

export default function ContactPage() {
  return (
    <>
      <Nav />

      <section className="px-6 py-16 text-center sm:py-24">
        <ScrollReveal className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-medium text-foreground sm:text-4xl">Contact us</h1>
          <p className="mt-4 text-muted-foreground">
            Questions about a class, a payment, or getting started — reach out any of these
            ways.
          </p>
        </ScrollReveal>
      </section>

      <section className="mx-auto max-w-2xl px-6 pb-24">
        <ScrollReveal className="flex flex-col gap-4">
          {CHANNELS.map((channel) => {
            const Icon = channel.icon;
            const content = (
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {channel.label}
                  </p>
                  <p className="text-foreground">{channel.value}</p>
                </div>
              </div>
            );

            return channel.href ? (
              <a key={channel.label} href={channel.href} className="transition hover:opacity-80">
                {content}
              </a>
            ) : (
              <div key={channel.label}>{content}</div>
            );
          })}
        </ScrollReveal>
      </section>

      <Footer />
    </>
  );
}
