import type { Role } from "./types";

/** Display label for a role. `ADMIN` is the front-desk staff role (vs SUPER_ADMIN). */
export function roleLabel(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "TEACHER":
      return "Teacher";
    case "ADMIN":
      return "Front Desk";
    case "MARKER":
      return "Marker";
    case "STUDENT":
      return "Student";
    default:
      return role;
  }
}
