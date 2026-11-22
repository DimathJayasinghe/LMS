import type { Role } from "@/lib/types";

/** The roles an owner can move a staff account between. The owner and student roles are never targets. */
export const CHANGEABLE_ROLES: Role[] = ["TEACHER", "ADMIN", "MARKER"];

interface Viewer {
  id: string;
  role: Role;
}

interface Target {
  id: string;
  role: Role;
  deletedAt?: string | null;
}

/**
 * Mirrors the backend rule so a row only offers what the API would accept: the front desk activates and deactivates
 * students and changes no role; the owner changes the status of any account and the role of an active teacher,
 * front-desk or marker account; nobody changes their own account. The backend stays the authority.
 */
export function accountActions(viewer: Viewer, target: Target): { canChangeStatus: boolean; canChangeRole: boolean } {
  if (viewer.id === target.id) return { canChangeStatus: false, canChangeRole: false };
  if (viewer.role === "ADMIN") return { canChangeStatus: target.role === "STUDENT", canChangeRole: false };
  if (viewer.role === "SUPER_ADMIN") {
    return { canChangeStatus: true, canChangeRole: !target.deletedAt && CHANGEABLE_ROLES.includes(target.role) };
  }
  return { canChangeStatus: false, canChangeRole: false };
}

/** The acting user's own password confirms a role change and the deactivation of any staff account. */
export function needsActorPassword(kind: "role" | "deactivate", target: { role: Role }): boolean {
  return kind === "role" || target.role !== "STUDENT";
}
