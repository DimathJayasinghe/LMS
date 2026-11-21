import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { hasPrismaCode } from '@/utils/prisma-error';
import { AUDIT_ACTION, BCRYPT_SALT_ROUNDS } from '@/utils/constants';
import { generateTemporaryPassword } from '@/utils/temp-password';
import { verifyActorPassword } from '@/services/auth.service';
import { logInTransaction } from '@/services/audit.service';
import { createSettingsReader, organizationForUser } from '@/services/settings.service';
import { STAFF_ROLES, type CreateStaffInput } from '@/schemas/user.schema';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { AuditContext } from '@/types/audit.types';

export interface CreatedStaff {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
}

const duplicateEmail = (): AppError =>
  new AppError('EMAIL_ALREADY_EXISTS', 409, 'An account with this email already exists.');

/**
 * Owner-only creation of a teacher, front-desk or marker account. The owner gets a one-time password to hand over; it
 * is hashed here and appears in no stored row, log or replayed response, and the new user must replace it at the first
 * sign-in. Replaces "register as a student, then promote", which left a student record and a card behind.
 */
export const createStaff = async (
  input: CreateStaffInput,
  actor: AuthenticatedUser,
  context: AuditContext,
): Promise<{ user: CreatedStaff; temporaryPassword: string }> => {
  if (actor.role !== Role.SUPER_ADMIN) {
    throw new AppError('FORBIDDEN', 403, 'Only the owner can create staff accounts.');
  }
  if (!(STAFF_ROLES as readonly Role[]).includes(input.role)) {
    throw new AppError('INVALID_STAFF_ROLE', 400, 'Choose teacher, front desk or marker.');
  }

  const organizationId = await organizationForUser(actor.userId);
  const setting = createSettingsReader(organizationId);

  // Step-up before any lookup or write, so a wrong password reveals nothing about existing accounts.
  if ((await setting('identity.stepUp.required')) && (await setting('identity.stepUp.actions')).includes('STAFF_CREATE')) {
    if (!input.currentPassword) {
      throw new AppError('STEP_UP_REQUIRED', 403, 'Enter your own password to create a staff account.');
    }
    await verifyActorPassword(actor.userId, input.currentPassword);
  }

  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw duplicateEmail();
  }

  const temporaryPassword = generateTemporaryPassword(await setting('identity.tempPassword.length'));
  const password = await bcrypt.hash(temporaryPassword, BCRYPT_SALT_ROUNDS);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          role: input.role,
          password,
          mustChangePassword: true,
          // Staff have no NIC photos or institute cards to set up.
          setupCompleted: true,
          organizationId,
        },
        select: { id: true, name: true, email: true, role: true, phone: true },
      });
      await logInTransaction(tx, {
        action: AUDIT_ACTION.STAFF_ACCOUNT_CREATED,
        description: 'Staff account created',
        targetType: 'User',
        targetId: created.id,
        organizationId,
        metadata: { role: created.role },
        context,
      });
      return created;
    });
    return { user, temporaryPassword };
  } catch (error) {
    // Another request took the address between the lookup above and the write.
    if (hasPrismaCode(error, 'P2002')) throw duplicateEmail();
    throw error;
  }
};
