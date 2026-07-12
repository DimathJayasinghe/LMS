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
 * Note: server-side we don't silently refresh an expired access token (RSC
 * can't set cookies). A refreshable session that has let its access token
 * lapse is sent to login and re-authenticated there; a Next middleware could
 * later add a server-side refresh (see 04-api-integration.md §6).
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
