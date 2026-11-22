import { Role, type Prisma } from '@prisma/client';
import { prisma } from '@/config/database';
import { withAdvisoryLock } from '@/utils/advisory-lock';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION, DEFAULT_ORGANIZATION_ID } from '@/utils/constants';
import { verifyActorPassword } from '@/services/auth.service';
import { logInTransaction } from '@/services/audit.service';
import { createSettingsReader } from '@/services/settings.service';
import { assertAccountChangeAllowed, assertCanManagePrivilegedTarget, type AccountChange } from '@/services/account-change-policy';
import { applyHandover, type HandoverMove, type HandoverRequest } from '@/services/handover.service';
import { userSelect, type SafeUser } from '@/services/user-select';
import type { UpdateRoleInput, UpdateStatusInput } from '@/schemas/user.schema';
import type { AuditContext } from '@/types/audit.types';

type Actor = { userId: string; role: Role };
type Setting = ReturnType<typeof createSettingsReader>;

export type AccountChangeInput = HandoverRequest & { reason?: string; currentPassword?: string; effectiveMonth?: 'NEXT' | 'CURRENT' };

export interface AccountChangeResult {
  user: SafeUser;
  /** False when the account was already in the requested state: nothing was written, ended or audited. */
  changed: boolean;
  handedOver: HandoverMove[];
}

const notFound = (): AppError => new AppError('USER_NOT_FOUND', 404, 'User not found.');

/** Actor against target, in the order the answer should reveal: privileged accounts, yourself, then the status/role matrix. */
const assertMayChange = (id: string, actor: Actor, targetRole: Role, change: AccountChange): void => {
  assertCanManagePrivilegedTarget(actor.role, targetRole);
  if (actor.userId === id) throw new AppError('FORBIDDEN', 403, 'Cannot change your own role or status.');
  assertAccountChangeAllowed(actor.role, targetRole, change);
};

/** The reason and the actor's own password, checked before the transaction so a wrong password never holds the owner lock. */
const confirmActor = async (setting: Setting, actor: Actor, targetRole: Role, change: AccountChange, input: AccountChangeInput): Promise<void> => {
  if (change.kind === 'role' && !input.reason && (await setting('identity.roleChange.reasonRequired'))) {
    throw new AppError('REASON_REQUIRED', 400, 'Give a reason for the role change.');
  }
  const action = change.kind === 'role' ? 'ROLE_CHANGE' : !change.isActive && targetRole !== Role.STUDENT ? 'STAFF_DEACTIVATE' : null;
  if (!action || !(await setting('identity.stepUp.required')) || !(await setting('identity.stepUp.actions')).includes(action)) return;
  if (!input.currentPassword) throw new AppError('STEP_UP_REQUIRED', 403, 'Enter your own password to confirm this change.');
  await verifyActorPassword(actor.userId, input.currentPassword);
};

const auditRow = (user: { role: Role }, change: AccountChange, input: AccountChangeInput, moves: HandoverMove[], effectiveMonth: string): { action: string; description: string; metadata: Prisma.InputJsonObject } => {
  const handover = moves.length > 0 ? { handedOver: moves.map(({ courseId, courseName, toTeacherId }) => ({ courseId, courseName, toTeacherId })), effectiveMonth } : {};
  const reason = input.reason ? { reason: input.reason } : {};
  return change.kind === 'role'
    ? { action: AUDIT_ACTION.ROLE_CHANGED, description: `Role changed from ${user.role} to ${change.role}`, metadata: { before: { role: user.role }, after: { role: change.role }, ...reason, ...handover } }
    : { action: change.isActive ? AUDIT_ACTION.USER_ACTIVATED : AUDIT_ACTION.USER_DEACTIVATED, description: change.isActive ? 'Account activated' : 'Account deactivated', metadata: { role: user.role, ...reason, ...handover } };
};

const changeAccount = async (id: string, change: AccountChange, input: AccountChangeInput, actor: Actor, context: AuditContext): Promise<AccountChangeResult> => {
  const first = await prisma.user.findUnique({ where: { id }, select: { role: true, organizationId: true } });
  if (!first) throw notFound();
  assertMayChange(id, actor, first.role, change);

  const organizationId = first.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const setting = createSettingsReader(organizationId);
  await confirmActor(setting, actor, first.role, change, input);
  const [lookaheadDays, required, defaultMonth] = await Promise.all([
    setting('identity.handoverLookaheadDays'), setting('identity.staffDeactivate.requireHandover'), setting('handover.defaultEffectiveMonth'),
  ]);

  return prisma.$transaction(async (tx) => {
    await withAdvisoryLock(tx, 'owner', organizationId, 'owner');
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) throw notFound();
    assertMayChange(id, actor, user.role, change);

    const removesOwner = user.role === Role.SUPER_ADMIN && user.deletedAt === null && (change.kind === 'role' ? change.role !== Role.SUPER_ADMIN : !change.isActive);
    if (removesOwner && await tx.user.count({ where: { organizationId: user.organizationId, role: Role.SUPER_ADMIN, deletedAt: null } }) <= 1) {
      throw new AppError('LAST_OWNER', 409, 'The last active owner cannot be changed.');
    }

    const unchanged = change.kind === 'role' ? change.role === user.role : change.isActive === (user.deletedAt === null);
    if (unchanged) return { user: (await tx.user.findUnique({ where: { id }, select: userSelect }))!, changed: false, handedOver: [] };

    // Leaving a teaching or marking role needs somebody to take over, decided in this same transaction as the change.
    const leaves = change.kind === 'role' || !change.isActive;
    const moves = leaves && (user.role === Role.TEACHER || user.role === Role.MARKER)
      ? await applyHandover(tx, { id, organizationId }, { handover: input.handover, handoverAllTo: input.handoverAllTo }, { lookaheadDays, now: new Date(), required, refuseOpenMarking: true })
      : [];

    // A role change or deactivation ends every session at once: the version bump kills access tokens on their next request, the delete kills refresh tokens.
    const data: Prisma.UserUpdateInput = change.kind === 'role' ? { role: change.role } : { deletedAt: change.isActive ? null : new Date() };
    if (leaves) data.tokenVersion = { increment: 1 };
    const updated = await tx.user.update({ where: { id }, data, select: userSelect });
    if (leaves) await tx.refreshToken.deleteMany({ where: { userId: id } });
    await logInTransaction(tx, { ...auditRow(user, change, input, moves, input.effectiveMonth ?? defaultMonth), targetType: 'User', targetId: id, organizationId, context });
    return { user: updated, changed: true, handedOver: moves };
  });
};

export const updateRole = (id: string, input: UpdateRoleInput, actor: Actor, context: AuditContext): Promise<AccountChangeResult> =>
  changeAccount(id, { kind: 'role', role: input.role }, input, actor, context);

export const updateStatus = (id: string, input: UpdateStatusInput, actor: Actor, context: AuditContext): Promise<AccountChangeResult> =>
  changeAccount(id, { kind: 'status', isActive: input.isActive }, input, actor, context);
