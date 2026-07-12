"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface AppShellProps {
  user: User;
  children: ReactNode;
}

/**
 * Responsive frame for the authenticated area: a fixed sidebar on desktop, a
 * slide-over drawer on mobile, and a sticky TopBar. The server layout
 * (`app/(app)/layout.tsx`) guards auth and passes the resolved user in.
 */
export default function AppShell({ user, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border lg:block">
        <Sidebar user={user} />
      </aside>

      {/* Mobile drawer — always mounted so it can slide in/out smoothly. */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          tabIndex={mobileOpen ? 0 : -1}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-300 motion-reduce:transition-none",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-64 border-r border-border bg-background shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            aria-label="Close navigation menu"
            tabIndex={mobileOpen ? 0 : -1}
            onClick={() => setMobileOpen(false)}
            className="absolute right-2 top-5 z-10 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
          <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      {/* Main column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <TopBar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
