import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/custom/AppShell";
import { api } from "@/lib/api";
import type { ApiSuccess, User } from "@/lib/types";

/**
 * Authenticated shell layout. Guards the whole `(app)` area server-side by
 * resolving the session from `GET /auth/me` (cookies forwarded); if that fails
 * we bounce to login before any protected UI renders. The backend remains the
 * real authority — this is the first gate, not the only one.
 *
 * Session continuity: this layout cannot refresh an expired access token (a
 * Server Component cannot set cookies). `frontend/proxy.ts` handles that before
 * the layout runs: a navigation whose access cookie has expired goes through
 * `/auth/session`, which refreshes once and returns here. See
 * context/frontend/04-api-integration.md §6.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookie = (await cookies()).toString();

  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }

  // Mandatory one-time onboarding (NIC photos) before any other screen —
  // see context/api_endpoints/account-setup.endpoints.md.
  if (user.role === "STUDENT" && !user.setupCompleted) {
    redirect("/auth/account-setup");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
