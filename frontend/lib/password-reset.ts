import type { Role } from "@/lib/types";

/**
 * Mirrors the backend rule for a staff-assisted reset so the button only appears where the API would accept it:
 * the front desk resets students; the owner resets any other account except another owner; nobody resets themselves.
 * The backend stays the authority.
 */
export function canResetPassword(
  viewer: { id: string; role: Role },
  target: { id: string; role: Role; deletedAt?: string | null },
): boolean {
  if (viewer.id === target.id || target.deletedAt) return false;
  if (viewer.role === "ADMIN") return target.role === "STUDENT";
  if (viewer.role === "SUPER_ADMIN") return target.role !== "SUPER_ADMIN";
  return false;
}

/** Staff targets need the acting user's own password as well (step-up). */
export function resetNeedsActorPassword(target: { role: Role }): boolean {
  return target.role !== "STUDENT";
}
