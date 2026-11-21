import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { isSettingKey, settingsRegistry, type SettingKey, type SettingValue } from '@/config/settings-registry';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION } from '@/utils/constants';
import { withAdvisoryLock } from '@/utils/advisory-lock';
import type { AuthenticatedUser } from '@/types/auth.types';

const requireOwner = (actor: AuthenticatedUser): void => {
  if (actor.role !== Role.SUPER_ADMIN) throw new AppError('FORBIDDEN_ROLE', 403, 'Only the owner can manage settings.');
};

export const organizationForUser = async (userId: string): Promise<string> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
  if (!user?.organizationId) throw new AppError('ORGANIZATION_NOT_FOUND', 404, 'Organization not found.');
  return user.organizationId;
};

export const createSettingsReader = (organizationId: string) => {
  const memo = new Map<SettingKey, Promise<unknown>>();
  return async <K extends SettingKey>(key: K): Promise<SettingValue<K>> => {
    let value = memo.get(key);
    if (!value) {
      value = prisma.organizationSetting.findUnique({ where: { organizationId_key: { organizationId, key } } })
        .then((row) => row ? settingsRegistry[key].schema.parse(row.value) : settingsRegistry[key].default);
      memo.set(key, value);
    }
    return await value as SettingValue<K>;
  };
};

export const listSettings = async (actor: AuthenticatedUser): Promise<{ key: string; value: unknown; default: unknown }[]> => {
  requireOwner(actor);
  const organizationId = await organizationForUser(actor.userId);
  const read = createSettingsReader(organizationId);
  return Promise.all((Object.keys(settingsRegistry) as SettingKey[]).map(async (key) => ({ key, value: await read(key), default: settingsRegistry[key].default })));
};

export const updateSetting = async (actor: AuthenticatedUser, key: string, value: unknown): Promise<{ key: string; value: unknown }> => {
  requireOwner(actor);
  if (!isSettingKey(key)) throw new AppError('UNKNOWN_SETTING', 400, 'Unknown setting.');
  const parsed = settingsRegistry[key].schema.safeParse(value);
  if (!parsed.success) throw new AppError('INVALID_SETTING_VALUE', 400, 'Invalid setting value.');
  const organizationId = await organizationForUser(actor.userId);
  await prisma.$transaction(async (tx) => {
    await withAdvisoryLock(tx, 'organization-setting', organizationId, key);
    const existing = await tx.organizationSetting.findUnique({ where: { organizationId_key: { organizationId, key } } });
    const before = existing?.value ?? settingsRegistry[key].default;
    if (JSON.stringify(before) === JSON.stringify(parsed.data)) return;
    const json = parsed.data as Prisma.InputJsonValue;
    await tx.organizationSetting.upsert({ where: { organizationId_key: { organizationId, key } }, create: { organizationId, key, value: json, updatedById: actor.userId }, update: { value: json, updatedById: actor.userId } });
    await tx.auditLog.create({ data: { action: AUDIT_ACTION.SETTING_CHANGED, targetType: 'OrganizationSetting', targetId: key, organizationId, actorId: actor.userId, actorRole: actor.role, metadata: { key, before: before as Prisma.InputJsonValue, after: json } } });
  });
  return { key, value: parsed.data };
};
