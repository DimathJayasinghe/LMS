"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { navForRole } from "@/lib/nav";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SidebarProps {
  user: User;
  /** Called after a nav link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void;
}

/**
 * Role-based navigation rail for the authenticated shell. Rendered both in the
 * fixed desktop column and inside the mobile drawer (see AppShell).
 */
export default function Sidebar({ user, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const sections = navForRole(user.role);

  return (
    <div className="flex h-full flex-col bg-background">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex h-16 items-center gap-2 border-b border-border px-6"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
          <GraduationCap className="size-4" aria-hidden />
        </span>
        <span className="text-base font-semibold text-foreground">LMS</span>
      </Link>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
        {sections.map((section, i) => (
          <div key={section.title ?? i} className="space-y-1">
            {section.title && (
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
