import { describe, expect, it } from "vitest";
import { canResetPassword, resetNeedsActorPassword } from "./password-reset";
import type { Role } from "@/lib/types";

const roles: Role[] = ["SUPER_ADMIN", "TEACHER", "ADMIN", "MARKER", "STUDENT"];

describe("canResetPassword", () => {
  it.each(roles)("front desk may reset only a student (target %s)", (role) => {
    expect(canResetPassword({ id: "v", role: "ADMIN" }, { id: "t", role })).toBe(role === "STUDENT");
  });
  it.each(roles)("the owner may reset anyone but another owner (target %s)", (role) => {
    expect(canResetPassword({ id: "v", role: "SUPER_ADMIN" }, { id: "t", role })).toBe(role !== "SUPER_ADMIN");
  });
  it.each(["TEACHER", "MARKER", "STUDENT"] as Role[])("%s never resets", (role) => {
    expect(canResetPassword({ id: "v", role }, { id: "t", role: "STUDENT" })).toBe(false);
  });
  it("never offers a reset on the viewer's own row or a deactivated account", () => {
    expect(canResetPassword({ id: "v", role: "ADMIN" }, { id: "v", role: "STUDENT" })).toBe(false);
    expect(canResetPassword({ id: "v", role: "ADMIN" }, { id: "t", role: "STUDENT", deletedAt: "2026-01-01" })).toBe(false);
  });
  it("asks for the actor password only for staff targets", () => {
    expect(resetNeedsActorPassword({ role: "STUDENT" })).toBe(false);
    expect(resetNeedsActorPassword({ role: "TEACHER" })).toBe(true);
  });
});
