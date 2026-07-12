import Link from "next/link";
import type { ReactNode } from "react";
import { GraduationCap, Mail, MapPin, Phone, ShieldCheck, Heart } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const explore = [
  { label: "Home", href: "/home" },
  { label: "Courses", href: "/courses" },
  { label: "Teachers", href: "/teachers" },
  { label: "About us", href: "/about" },
];

const support = [
  { label: "Contact us", href: "/contact" },
  { label: "FAQs", href: "/faq" },
  { label: "Help center", href: "/help" },
  { label: "Log in", href: "/auth/login" },
];

const legal = [
  { label: "Privacy policy", href: "/privacy" },
  { label: "Terms & conditions", href: "/terms" },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="text-foreground/70">{icon}</span>
      {children}
    </li>
  );
}

export default function Footer() {
  return (
    <footer className="w-full border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <GraduationCap className="size-4" aria-hidden />
              </span>
              <span className="text-base font-semibold text-foreground">LMS</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Live and recorded classes, exams, and results for our students —
              all in one place, from anywhere.
            </p>
            <Separator />
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} LMS. All rights reserved.
            </p>
          </div>

          <FooterColumn title="Explore" links={explore} />
          <FooterColumn title="Support" links={support} />

          {/* Contact */}
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold text-foreground">Contact</p>
            <ul className="flex flex-col gap-3">
              <ContactRow icon={<Mail className="size-4" aria-hidden />}>
                <a
                  href="mailto:hello@lms.lk"
                  className="transition-colors hover:text-foreground"
                >
                  hello@lms.lk
                </a>
              </ContactRow>
              <ContactRow icon={<Phone className="size-4" aria-hidden />}>
                <a
                  href="tel:+94112345678"
                  className="transition-colors hover:text-foreground"
                >
                  +94 11 234 5678
                </a>
              </ContactRow>
              <ContactRow icon={<MapPin className="size-4" aria-hidden />}>
                Colombo, Sri Lanka
              </ContactRow>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-4 sm:flex-row">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Made with <Heart className="size-4 fill-current" aria-hidden /> in Sri Lanka.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden />
              <span>Secure payments</span>
            </div>
            <div className="flex items-center gap-2">
              {legal.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
              <Badge variant="outline" className="px-2 py-0.5 text-xs font-bold">
                VISA
              </Badge>
              <Badge variant="outline" className="px-2 py-0.5 text-xs font-bold">
                MASTERCARD
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
