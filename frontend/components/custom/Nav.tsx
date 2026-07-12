"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);

  // Below `md` the link list collapses into this menu — close it if a
  // resize (e.g. rotating a tablet) crosses back over the breakpoint,
  // otherwise it can get stuck open behind the now-visible desktop nav.
  useEffect(() => {
    if (!open) return;
    const mql = window.matchMedia("(min-width: 48rem)");
    const handleChange = () => setOpen(false);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [open]);

  // Route changes (a link was followed) should also close it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <nav className="relative z-50 mx-4 mb-8 mt-8 w-auto min-w-fit max-w-[50rem] sm:mx-auto sm:mt-14 sm:w-full">
      <div className="flex items-center justify-between rounded-full border border-foreground bg-background p-1.5">
        <Link
          href="/home"
          aria-label="Home"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background"
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
          className="hidden items-center self-stretch rounded-full bg-foreground px-8 text-sm text-background transition hover:opacity-90 md:flex"
        >
          Login
        </Link>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav-menu"
          onClick={() => setOpen((v) => !v)}
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-muted md:hidden"
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-nav-menu"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: "easeOut" }}
            // z-[60], not z-50 — StudentReviews/Header are later-DOM siblings
            // also at z-50, so at equal z-index they'd paint over this panel
            // (ties resolve by DOM order, not who's "on top" visually).
            className="absolute inset-x-0 top-full z-[60] mt-2 overflow-hidden rounded-3xl border border-foreground bg-background p-2 md:hidden"
          >
            <ul className="flex flex-col text-base text-muted-foreground">
              {LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-2xl px-4 py-3 transition-colors",
                        active ? "bg-muted font-medium text-foreground" : "hover:bg-muted hover:text-foreground",
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
              className="mt-1 block rounded-2xl bg-foreground px-4 py-3 text-center text-sm font-medium text-background transition hover:opacity-90"
            >
              Login
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
