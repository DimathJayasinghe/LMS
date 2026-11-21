import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { withAdvisoryLock } from '@/utils/advisory-lock';
import { AUDIT_ACTION, BCRYPT_SALT_ROUNDS, DEFAULT_ORGANIZATION_ID } from '@/utils/constants';
import { generateTemporaryPassword } from '@/utils/temp-password';
import { verifyActorPassword } from '@/services/auth.service';
import { createSettingsReader } from '@/services/settings.service';
import type { ResetPasswordInput } from '@/schemas/user.schema';
import type { AuthenticatedUser } from '@/types/auth.types';

interface ResetTarget {
  id: string;
  role: Role;
  deletedAt: Date | null;
  organizationId: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The front desk resets students only; the owner resets any other account except another owner (owner recovery stays an
 * operator command). Nobody resets their own account here, because that is the change-password flow.
 */
const assertMayReset = (actor: AuthenticatedUser, target: ResetTarget): void => {
  const mayReset =
    actor.userId !== target.id &&
    ((actor.role === Role.ADMIN && target.role === Role.STUDENT) ||
      (actor.role === Role.SUPER_ADMIN && target.role !== Role.SUPER_ADMIN));
  if (!mayReset) {
    throw new AppError('FORBIDDEN', 403, 'You cannot reset the password of this account.');
  }
};

const loadTarget = async (db: Pick<typeof prisma, 'user'>, targetId: string): Promise<ResetTarget> => {
  const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, deletedAt: true, organizationId: true } });
  if (!target) throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
  return target;
};

/**
 * Staff-assisted password reset (the account holder cannot recover a password by email or SMS). Returns a one-time
 * password that the caller shows once; it is hashed here and appears in no stored row, log or replayed response.
 * Rate limits count the audit rows this function writes, serialized by an advisory lock, so they need no extra storage.
 */
export const resetPassword = async (
  targetId: string,
  input: ResetPasswordInput,
  actor: AuthenticatedUser,
  context: { ip?: string; userAgent?: string },
): Promise<{ temporaryPassword: string }> => {
  if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) {
    throw new AppError('FORBIDDEN', 403, 'You cannot reset the password of this account.');
  }

  const first = await loadTarget(prisma, targetId);
  assertMayReset(actor, first);
  if (first.deletedAt) {
    throw new AppError('ACCOUNT_DEACTIVATED', 409, 'Activate the account before resetting its password.');
  }

  const organizationId = first.organizationId ?? DEFAULT_ORGANIZATION_ID;
  const setting = createSettingsReader(organizationId);

  // Step-up before any write, outside the transaction so the password check never holds the lock.
  if (first.role !== Role.STUDENT && (await setting('identity.stepUp.required')) && (await setting('identity.stepUp.actions')).includes('STAFF_PASSWORD_RESET')) {
    if (!input.currentPassword) {
      throw new AppError('STEP_UP_REQUIRED', 403, 'Enter your own password to reset a staff account.');
    }
    await verifyActorPassword(actor.userId, input.currentPassword);
  }

  const [length, maxPerActor, maxPerTarget] = await Promise.all([
    setting('identity.tempPassword.length'),
    setting('identity.reset.maxPerActorPerDay'),
    setting('identity.reset.maxPerTargetPer24h'),
  ]);
  const temporaryPassword = generateTemporaryPassword(length);
  const hashed = await bcrypt.hash(temporaryPassword, BCRYPT_SALT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    await withAdvisoryLock(tx, 'password-reset', organizationId, 'reset');

    // The role may have changed since the first read; the rule is applied again on the row the write will touch.
    // A different role would also change whether the step-up above was required, so the request is refused.
    const target = await loadTarget(tx, targetId);
    assertMayReset(actor, target);
    if (target.role !== first.role) {
      throw new AppError('TARGET_CHANGED', 409, 'This account changed while the reset was running. Try again.');
    }
    if (target.deletedAt) {
      throw new AppError('ACCOUNT_DEACTIVATED', 409, 'Activate the account before resetting its password.');
    }

    const since = new Date(Date.now() - DAY_MS);
    const base = { action: AUDIT_ACTION.PASSWORD_RESET_BY_STAFF, createdAt: { gte: since } };
    if ((await tx.auditLog.count({ where: { ...base, actorId: actor.userId } })) >= maxPerActor) {
      throw new AppError('RESET_LIMIT_ACTOR', 429, 'You have reached the daily limit for password resets.');
    }
    if ((await tx.auditLog.count({ where: { ...base, targetType: 'User', targetId } })) >= maxPerTarget) {
      throw new AppError('RESET_LIMIT_TARGET', 429, 'This account has had too many resets in the last 24 hours.');
    }

    // passwordChangedAt is left alone: a reset must not start the self-service cooldown.
    await tx.user.update({ where: { id: targetId }, data: { password: hashed, mustChangePassword: true, tokenVersion: { increment: 1 } } });
    await tx.refreshToken.deleteMany({ where: { userId: targetId } });
    await tx.auditLog.create({
      data: {
        action: AUDIT_ACTION.PASSWORD_RESET_BY_STAFF,
        description: 'Password reset by staff',
        targetType: 'User',
        targetId,
        metadata: { identityCheck: input.identityCheck },
        ip: context.ip,
        userAgent: context.userAgent,
        actorId: actor.userId,
        actorRole: actor.role,
        organizationId,
      },
    });
  });

  return { temporaryPassword };
};
