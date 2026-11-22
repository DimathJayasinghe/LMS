import { describe, expect, it } from "vitest";
import { accountActions, needsActorPassword } from "./account-actions";
import type { Role } from "./types";

const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "TEACHER", "MARKER", "STUDENT"];
const target = (role: Role, over: Record<string, unknown> = {}) => ({ id: "t1", role, deletedAt: null, ...over });

describe("accountActions — front desk", () => {
  const desk = { id: "v1", role: "ADMIN" as Role };

  it.each(ROLES)("changes the status of a student only, never a role (%s)", (role) => {
    expect(accountActions(desk, target(role))).toEqual({ canChangeStatus: role === "STUDENT", canChangeRole: false });
  });

  it("offers a deactivated student the activate action", () => {
    expect(accountActions(desk, target("STUDENT", { deletedAt: "2026-11-01" })).canChangeStatus).toBe(true);
  });
});

describe("accountActions — owner", () => {
  const owner = { id: "v1", role: "SUPER_ADMIN" as Role };

  it.each(ROLES)("can change the status of %s", (role) => {
    expect(accountActions(owner, target(role)).canChangeStatus).toBe(true);
  });

  it.each([["TEACHER", true], ["ADMIN", true], ["MARKER", true], ["STUDENT", false], ["SUPER_ADMIN", false]] as const)("role of %s: %s", (role, expected) => {
    expect(accountActions(owner, target(role)).canChangeRole).toBe(expected);
  });

  it("does not offer a role change on a deactivated account", () => {
    expect(accountActions(owner, target("TEACHER", { deletedAt: "2026-11-01" })).canChangeRole).toBe(false);
  });
});

describe("accountActions — everyone else, and yourself", () => {
  it.each(["TEACHER", "MARKER", "STUDENT"] as Role[])("%s changes nothing", (role) => {
    expect(accountActions({ id: "v1", role }, target("STUDENT"))).toEqual({ canChangeStatus: false, canChangeRole: false });
  });

  it.each(["SUPER_ADMIN", "ADMIN"] as Role[])("%s has no actions on their own row", (role) => {
    expect(accountActions({ id: "v1", role }, target("STUDENT", { id: "v1" }))).toEqual({ canChangeStatus: false, canChangeRole: false });
  });
});

describe("needsActorPassword", () => {
  it("always for a role change", () => expect(needsActorPassword("role", { role: "TEACHER" })).toBe(true));
  it("for deactivating staff, not students", () => {
    expect(needsActorPassword("deactivate", { role: "TEACHER" })).toBe(true);
    expect(needsActorPassword("deactivate", { role: "STUDENT" })).toBe(false);
  });
});
