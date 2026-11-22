import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { assertAccountChangeAllowed, assertCanManagePrivilegedTarget, STAFF_CHANGE_ROLES, type AccountChange } from './account-change-policy';

const ALL = [Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT];
const deactivate: AccountChange = { kind: 'status', isActive: false };
const reactivate: AccountChange = { kind: 'status', isActive: true };
const roleTo = (role: Role): AccountChange => ({ kind: 'role', role });

const verdict = (actor: Role, target: Role, change: AccountChange): 'allowed' | string => {
  try {
    assertCanManagePrivilegedTarget(actor, target);
    assertAccountChangeAllowed(actor, target, change);
    return 'allowed';
  } catch (error) {
    return (error as { code: string }).code;
  }
};

describe('status changes: who may change whose', () => {
  // Rows: actor. Columns: target. The front desk handles students only; the owner handles every kind of account.
  it.each([
    [Role.ADMIN, Role.STUDENT, 'allowed'],
    [Role.ADMIN, Role.TEACHER, 'FORBIDDEN'],
    [Role.ADMIN, Role.MARKER, 'FORBIDDEN'],
    [Role.ADMIN, Role.ADMIN, 'FORBIDDEN'],
    [Role.ADMIN, Role.SUPER_ADMIN, 'FORBIDDEN'],
    [Role.SUPER_ADMIN, Role.STUDENT, 'allowed'],
    [Role.SUPER_ADMIN, Role.TEACHER, 'allowed'],
    [Role.SUPER_ADMIN, Role.MARKER, 'allowed'],
    [Role.SUPER_ADMIN, Role.ADMIN, 'allowed'],
    [Role.SUPER_ADMIN, Role.SUPER_ADMIN, 'allowed'], // another owner, only through the owner-safety rules in the service
  ])('%s changing the status of %s: %s', (actor, target, expected) => {
    expect(verdict(actor, target, deactivate)).toBe(expected);
    expect(verdict(actor, target, reactivate)).toBe(expected);
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('a %s is never allowed to change a status', (actor) => {
    for (const target of ALL) expect(verdict(actor, target, deactivate)).toBe('FORBIDDEN');
  });
});

describe('role changes', () => {
  it.each(ALL)('the front desk changes the role of nobody (target %s)', (target) => {
    expect(verdict(Role.ADMIN, target, roleTo(Role.TEACHER))).toBe('FORBIDDEN');
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('a %s changes the role of nobody', (actor) => {
    for (const target of ALL) expect(verdict(actor, target, roleTo(Role.TEACHER))).toBe('FORBIDDEN');
  });

  it.each([Role.TEACHER, Role.ADMIN, Role.MARKER])('the owner moves a %s among teacher, front desk and marker', (target) => {
    for (const next of STAFF_CHANGE_ROLES) expect(verdict(Role.SUPER_ADMIN, target, roleTo(next))).toBe('allowed');
  });

  it('the owner role is never assigned through the API', () => {
    expect(verdict(Role.SUPER_ADMIN, Role.TEACHER, roleTo(Role.SUPER_ADMIN))).toBe('FORBIDDEN');
  });

  it.each([Role.TEACHER, Role.MARKER, Role.ADMIN, Role.SUPER_ADMIN])('staff (%s) are never turned into students', (target) => {
    expect(verdict(Role.SUPER_ADMIN, target, roleTo(Role.STUDENT))).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it.each([Role.TEACHER, Role.MARKER, Role.ADMIN])('a student is never promoted to %s', (next) => {
    expect(verdict(Role.SUPER_ADMIN, Role.STUDENT, roleTo(next))).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('a student asked to stay a student is refused too, not treated as a no-op', () => {
    expect(verdict(Role.SUPER_ADMIN, Role.STUDENT, roleTo(Role.STUDENT))).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });
});

describe('check ordering', () => {
  it('reports the actor-versus-target refusal before the student boundary, so a front desk learns nothing else', () => {
    expect(verdict(Role.ADMIN, Role.STUDENT, roleTo(Role.TEACHER))).toBe('FORBIDDEN');
  });
});
