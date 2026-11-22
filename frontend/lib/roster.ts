import type { Role } from "./types";

/** Roles the roster endpoint answers; a teacher still only gets the classes they teach. */
export function canViewRoster(role: Role): boolean {
  return role === "TEACHER" || role === "ADMIN" || role === "SUPER_ADMIN";
}

/** The `?rosterPage=` query value as a page number: anything that is not a positive whole number is the first page. */
export function rosterPageOf(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
}
