import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

export type AccountChange = { kind: 'role'; role: Role } | { kind: 'status'; isActive: boolean };

/** The roles an owner may move a staff account between. The owner role and the student role are never targets. */
export const STAFF_CHANGE_ROLES = [Role.TEACHER, Role.ADMIN, Role.MARKER] as const;

const forbidden = (message: string): AppError => new AppError('FORBIDDEN', 403, message);

// Front-desk (ADMIN) manages day-to-day accounts but must never be able to touch a
// privileged peer/superior account (ADMIN or SUPER_ADMIN) — only SUPER_ADMIN can.
export const assertCanManagePrivilegedTarget = (actorRole: Role, targetRole: Role): void => {
  const targetIsPrivileged = targetRole === Role.SUPER_ADMIN || targetRole === Role.ADMIN;

  if (targetIsPrivileged && actorRole !== Role.SUPER_ADMIN) {
    throw forbidden('Only a super admin can modify an admin or super admin account.');
  }
};

/**
 * Who may change the status or role of whom (decision D-IDENTITY-6). The front desk changes the status of students only
 * and the role of nobody; the owner changes the status of any account (another owner only through the owner-safety
 * rules in the service) and the role of teacher, front-desk and marker accounts. A student is never promoted to staff
 * and staff are never demoted to a student: create the right kind of account and deactivate the old one.
 * Pure: the service runs it before any hand-over work, so a refused actor never learns what a target owns.
 */
export const assertAccountChangeAllowed = (actorRole: Role, targetRole: Role, change: AccountChange): void => {
  if (change.kind === 'status') {
    if (actorRole === Role.SUPER_ADMIN) return;
    if (actorRole === Role.ADMIN && targetRole === Role.STUDENT) return;
    throw forbidden('Front desk can only activate or deactivate student accounts.');
  }

  if (actorRole !== Role.SUPER_ADMIN) throw forbidden('Only the owner can change a role.');
  if (change.role === Role.SUPER_ADMIN) throw forbidden('Owner accounts are managed by an operator.');
  if (targetRole === Role.STUDENT || change.role === Role.STUDENT) {
    throw new AppError(
      'ROLE_CHANGE_NOT_ALLOWED',
      409,
      'A student is never promoted to staff and staff are never moved to a student account. Create a new account and deactivate the old one.',
    );
  }
};
