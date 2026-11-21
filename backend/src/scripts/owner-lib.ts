import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';
import { AUDIT_ACTION, DEFAULT_ORGANIZATION_ID } from '../utils/constants';
import { withAdvisoryLock } from '../utils/advisory-lock';

const organizationId = DEFAULT_ORGANIZATION_ID;

export const seedOwner = async (db: PrismaClient, email: string, password: string): Promise<'created' | 'exists' | 'email-taken'> => {
  return db.$transaction(async (tx) => {
    await withAdvisoryLock(tx, 'owner', organizationId, 'owner');
    if (await tx.user.findFirst({ where: { organizationId, role: Role.SUPER_ADMIN } })) return 'exists';
    if (await tx.user.findUnique({ where: { email } })) return 'email-taken';
    await tx.user.create({ data: { email, name: 'Super Admin', password: await bcrypt.hash(password, 10), role: Role.SUPER_ADMIN, setupCompleted: true, organizationId } });
    return 'created';
  });
};

export const addOwner = async (db: PrismaClient, email: string, password: string): Promise<void> => {
  await db.$transaction(async (tx) => {
    await withAdvisoryLock(tx, 'owner', organizationId, 'owner');
    if (await tx.user.findUnique({ where: { email } })) throw new Error('Email already belongs to an account.');
    const owner = await tx.user.create({ data: { email, name: 'Super Admin', password: await bcrypt.hash(password, 10), role: Role.SUPER_ADMIN, setupCompleted: true, organizationId } });
    await tx.auditLog.create({ data: { action: AUDIT_ACTION.OWNER_ADDED, actorId: owner.id, actorRole: Role.SUPER_ADMIN, targetType: 'User', targetId: owner.id, organizationId, metadata: { via: 'operator-cli' } } });
  });
};

export const resetOwnerPassword = async (db: PrismaClient, email: string, password: string, reactivate: boolean): Promise<void> => {
  await db.$transaction(async (tx) => {
    const initial = await tx.user.findUnique({ where: { email } });
    if (!initial || initial.role !== Role.SUPER_ADMIN) throw new Error('Owner account not found.');
    await withAdvisoryLock(tx, 'owner', initial.organizationId ?? organizationId, 'owner');
    const owner = await tx.user.findUnique({ where: { email } });
    if (!owner || owner.role !== Role.SUPER_ADMIN) throw new Error('Owner account not found.');
    await tx.user.update({ where: { id: owner.id }, data: { password: await bcrypt.hash(password, 10), ...(reactivate ? { deletedAt: null } : {}) } });
    await tx.refreshToken.deleteMany({ where: { userId: owner.id } });
    await tx.auditLog.create({ data: { action: AUDIT_ACTION.OWNER_PASSWORD_RESET, actorId: owner.id, actorRole: Role.SUPER_ADMIN, targetType: 'User', targetId: owner.id, organizationId: owner.organizationId, metadata: { via: 'operator-cli' } } });
  });
};
