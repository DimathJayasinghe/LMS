"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/home", label: "Home" },
  { href: "/about", label: "About us" },
  { href: "/courses", label: "Courses" },
  { href: "/teachers", label: "Teachers" },
  { href: "/contact", label: "Contact us" },
];

export default function Nav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <nav className="relative z-50 mx-4 mb-8 mt-8 flex w-auto min-w-fit max-w-[50rem] items-center justify-between rounded-full border border-foreground bg-background p-1.5 sm:mx-auto sm:mt-14 sm:w-full">
      <Link
        href="/home"
        aria-label="Home"
        className="flex size-12 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background"
      >
        L
      </Link>

      <ul className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href} className="relative">
              {active && (
                <motion.span
                  layoutId="nav-active-pill"
                  className="absolute -inset-x-2.5 -inset-y-1.5 -z-10 rounded-full bg-muted"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "transition-colors",
                  active ? "font-medium text-foreground" : "hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <Link
        href="/auth/login"
        className="flex items-center self-stretch rounded-full bg-foreground px-8 text-sm text-background transition hover:opacity-90"
      >
        Login
      </Link>
    </nav>
  );
}
