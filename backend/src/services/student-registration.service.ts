import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION, BCRYPT_SALT_ROUNDS } from '@/utils/constants';
import { colomboDayOf } from '@/utils/org-time';
import { generateTemporaryPassword } from '@/utils/temp-password';
import { logInTransaction } from '@/services/audit.service';
import { organizationClockForUser } from '@/services/organization-clock.service';
import { createSettingsReader } from '@/services/settings.service';
import { assertRegistrationRules, createStudentAccount, duplicateEmail, type RegisteredStudent } from '@/services/student-account.service';
import { findPossibleDuplicates } from '@/services/student-duplicates.service';
import type { CreateStudentInput } from '@/schemas/student-registration.schema';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { AuditContext } from '@/types/audit.types';

/**
 * Walk-in registration at the front desk: the student gets an index number, a card and a one-time password for the
 * registration slip, and is asked to replace the password at the first sign-in. A student who looks like one already
 * registered stops the clerk once with who they might be; the clerk can go ahead with a reason, which is recorded. The
 * password is hashed here and appears in no stored row, log or replayed response.
 */
export const createStudentAsStaff = async (
  input: CreateStudentInput,
  actor: AuthenticatedUser,
  context: AuditContext,
  now: Date = new Date(),
): Promise<{ user: RegisteredStudent; temporaryPassword: string }> => {
  if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
    throw new AppError('FORBIDDEN', 403, 'Only the front desk or the owner can register a student.');
  }

  const { organizationId, timezone } = await organizationClockForUser(actor.userId);
  const setting = createSettingsReader(organizationId);
  const [minorAgeYears, passwordLength, warnAboutDuplicates] = await Promise.all([
    setting('identity.minorAgeYears'),
    setting('identity.tempPassword.length'),
    setting('identity.register.duplicateWarning'),
  ]);

  assertRegistrationRules(input, { minorAgeYears, today: colomboDayOf(now, timezone) });

  const possibleDuplicates = warnAboutDuplicates
    ? await findPossibleDuplicates(prisma, organizationId, { name: input.name, numbers: [input.phone, input.guardianMobile] })
    : [];
  if (possibleDuplicates.length > 0 && !input.duplicateOverrideReason) {
    throw new AppError('POSSIBLE_DUPLICATE', 409, 'This looks like a student who is already registered. Check before registering again.', { matches: possibleDuplicates });
  }

  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw duplicateEmail();

  const temporaryPassword = generateTemporaryPassword(passwordLength);
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_SALT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    // The clerk met the guardian, so the consent is the front desk's confirmation; setup needs no NIC photos here.
    const created = await createStudentAccount(tx, { ...input, organizationId, passwordHash, setupCompleted: true, mustChangePassword: true });
    await logInTransaction(tx, {
      action: AUDIT_ACTION.STUDENT_REGISTERED_BY_STAFF,
      description: 'Student registered at the front desk',
      targetType: 'User',
      targetId: created.id,
      organizationId,
      metadata: {
        ...(input.guardianConsent ? { guardianConsentSource: 'FRONT_DESK' } : {}),
        ...(possibleDuplicates.length > 0 ? { duplicateOverride: { reason: input.duplicateOverrideReason ?? null, matchedIndexNumbers: possibleDuplicates.map((match) => match.indexNumber) } } : {}),
      },
      context,
    });
    return created;
  });

  return { user, temporaryPassword };
};
