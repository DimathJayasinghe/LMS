import { Prisma, Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';
import { isMinorOn } from '@/utils/age';
import { hasPrismaCode } from '@/utils/prisma-error';
import { formatLmsBarcode } from '@/utils/scan-code';
import { assertScanCodeFree } from '@/services/scan-code.service';

export interface RegistrationRules {
  minorAgeYears: number;
  /** Today in the organization's time zone, `YYYY-MM-DD`. */
  today: string;
}

export interface GuardianFields {
  dateOfBirth: string;
  guardianName?: string | undefined;
  guardianMobile?: string | undefined;
  guardianConsent?: boolean | undefined;
}

export interface NewStudent extends GuardianFields {
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string;
  phone?: string | undefined;
  address?: string | undefined;
  city?: string | undefined;
  setupCompleted: boolean;
  mustChangePassword: boolean;
}

/** What a registration response may say about the new account: enough to sign in and to print the card, nothing more. */
export const registeredStudentSelect = {
  id: true,
  indexNumber: true,
  name: true,
  email: true,
  role: true,
  barcode: true,
  mustChangePassword: true,
  setupCompleted: true,
  tokenVersion: true,
} satisfies Prisma.UserSelect;

export type RegisteredStudent = Prisma.UserGetPayload<{ select: typeof registeredStudentSelect }>;

export const duplicateEmail = (): AppError =>
  new AppError('EMAIL_ALREADY_EXISTS', 409, 'An account with this email already exists.');

/** The one rule both registration paths share: a real birth date, and a guardian with consent for anyone under the adult age. */
export const assertRegistrationRules = (input: GuardianFields, rules: RegistrationRules): void => {
  if (input.dateOfBirth > rules.today) {
    throw new AppError('INVALID_DATE_OF_BIRTH', 400, 'The date of birth cannot be in the future.');
  }
  if (!isMinorOn(input.dateOfBirth, rules.today, rules.minorAgeYears)) return;
  if (!input.guardianName || !input.guardianMobile) {
    throw new AppError('GUARDIAN_REQUIRED', 400, `A student under ${rules.minorAgeYears} needs a guardian's name and mobile number.`);
  }
  if (!input.guardianConsent) {
    throw new AppError('GUARDIAN_CONSENT_REQUIRED', 400, 'The guardian must agree to the registration.');
  }
};

/**
 * Creates the student and their card in the caller's transaction: the index number only exists once the row does, so the
 * card code is a follow-up write, and a card that collides with an existing code fails the whole registration instead
 * of leaving a student without one.
 */
export const createStudentAccount = async (tx: Prisma.TransactionClient, data: NewStudent): Promise<RegisteredStudent> => {
  try {
    const created = await tx.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        name: data.name,
        password: data.passwordHash,
        role: Role.STUDENT,
        phone: data.phone ?? null,
        address: data.address ?? null,
        city: data.city ?? null,
        dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00.000Z`),
        guardianName: data.guardianName ?? null,
        guardianMobile: data.guardianMobile ?? null,
        guardianConsentAt: data.guardianConsent ? new Date() : null,
        setupCompleted: data.setupCompleted,
        mustChangePassword: data.mustChangePassword,
      },
      select: { id: true, indexNumber: true },
    });

    const barcode = formatLmsBarcode(created.indexNumber);
    await assertScanCodeFree(tx, barcode, { exceptUserId: created.id, allowLmsFormat: true });
    return await tx.user.update({ where: { id: created.id }, data: { barcode }, select: registeredStudentSelect });
  } catch (error) {
    // Another request took the address between the caller's lookup and this write.
    if (hasPrismaCode(error, 'P2002')) throw duplicateEmail();
    throw error;
  }
};
