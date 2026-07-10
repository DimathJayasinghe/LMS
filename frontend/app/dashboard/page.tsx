"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";

import { useAuth } from "@/lib/hooks/useAuth";

/**
 * Minimal authenticated landing that closes the auth loop (login → dashboard →
 * logout). The full role-aware `(app)` shell (sidebar/topbar) is a later phase —
 * see context/frontend/06-frontend-roadmap.md.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {user.role.replace("_", " ")}
      </span>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">
        Welcome, {user.name.split(" ")[0]}.
      </h1>
      <p className="mt-3 text-muted-foreground">
        You&apos;re signed in as{" "}
        <span className="text-foreground">{user.email}</span>. Your dashboard is
        coming soon.
      </p>

      <div className="mt-8">
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push("/auth/login");
          }}
          className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-medium transition hover:bg-foreground hover:text-background"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
