import bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { withAdvisoryLock } from '@/utils/advisory-lock';
import { BCRYPT_SALT_ROUNDS, DEFAULT_ORGANIZATION_ID } from '@/utils/constants';
import { colomboDayOf } from '@/utils/org-time';
import { mobileVariants } from '@/utils/sri-lanka-mobile';
import { createSettingsReader } from '@/services/settings.service';
import { assertRegistrationRules, createStudentAccount, duplicateEmail, type RegisteredStudent } from '@/services/student-account.service';
import type { RegisterInput } from '@/schemas/auth.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One phone cannot spawn many accounts: siblings share a number, so the cap is generous, but a bot cycling emails on one
 * number stops. Counted in the database, under a lock per number, so two requests at once cannot both slip under it.
 */
const assertUnderPhoneCap = async (tx: Prisma.TransactionClient, organizationId: string, number: string, cap: number, now: Date): Promise<void> => {
  const registered = await tx.user.count({
    where: {
      organizationId,
      role: Role.STUDENT,
      createdAt: { gte: new Date(now.getTime() - DAY_MS) },
      OR: [{ phone: { in: mobileVariants(number) } }, { guardianMobile: { in: mobileVariants(number) } }],
    },
  });
  if (registered >= cap) {
    throw new AppError('REGISTRATION_LIMIT_REACHED', 429, 'Too many registrations for this mobile number today. Please visit the front desk.');
  }
};

/** Public sign-up for a student of the default organization (the public site has no other tenant yet). */
export const registerSelf = async (data: RegisterInput, now: Date = new Date()): Promise<RegisteredStudent> => {
  const organizationId = DEFAULT_ORGANIZATION_ID;
  const setting = createSettingsReader(organizationId);

  if (!(await setting('identity.register.selfRegistrationEnabled'))) {
    throw new AppError('SELF_REGISTRATION_DISABLED', 403, 'Online registration is closed. Please register at the front desk.');
  }

  const [minorAgeYears, perPhonePerDay, organization] = await Promise.all([
    setting('identity.minorAgeYears'),
    setting('identity.register.perPhonePerDay'),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  assertRegistrationRules(data, { minorAgeYears, today: colomboDayOf(now, organization?.timezone ?? 'Asia/Colombo') });

  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) throw duplicateEmail();

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);
  const numbers = [...new Set([data.phone, data.guardianMobile].filter((number): number is string => Boolean(number)))].sort();

  return prisma.$transaction(async (tx) => {
    for (const number of numbers) {
      await withAdvisoryLock(tx, 'register-phone', organizationId, number);
      await assertUnderPhoneCap(tx, organizationId, number, perPhonePerDay, now);
    }
    return createStudentAccount(tx, { ...data, organizationId, passwordHash, setupCompleted: false, mustChangePassword: false });
  });
};
