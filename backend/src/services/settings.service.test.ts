import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({ userFind: vi.fn(), find: vi.fn(), upsert: vi.fn(), audit: vi.fn(), lock: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: {
  user: { findUnique: mocks.userFind }, organizationSetting: { findUnique: mocks.find, upsert: mocks.upsert },
  auditLog: { create: mocks.audit }, $transaction: async (fn: (tx: unknown) => unknown) => fn({ organizationSetting: { findUnique: mocks.find, upsert: mocks.upsert }, auditLog: { create: mocks.audit }, $executeRaw: mocks.lock }),
} }));
import { createSettingsReader, updateSetting } from './settings.service';

beforeEach(() => { vi.clearAllMocks(); mocks.userFind.mockResolvedValue({ organizationId: 'org' }); mocks.find.mockResolvedValue(null); mocks.upsert.mockImplementation(async ({ create }) => create); });

describe('organization settings', () => {
  it('falls back to defaults and memoizes only within one reader', async () => {
    const first = createSettingsReader('org');
    expect(await first('fees.graceDays')).toBe(10);
    expect(await first('fees.graceDays')).toBe(10);
    mocks.find.mockResolvedValueOnce({ value: 4 });
    expect(await createSettingsReader('org')('fees.graceDays')).toBe(4);
    expect(mocks.find).toHaveBeenCalledTimes(2);
  });
  it.each([Role.STUDENT, Role.TEACHER, Role.ADMIN, Role.MARKER])('rejects %s before looking up settings', async (role) => {
    await expect(updateSetting({ userId: 'u', role }, 'fees.graceDays', 5)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it('rejects unknown keys and invalid values', async () => {
    const owner = { userId: 'u', role: Role.SUPER_ADMIN };
    await expect(updateSetting(owner, 'unknown', 1)).rejects.toMatchObject({ statusCode: 400 });
    await expect(updateSetting(owner, 'fees.graceDays', 32)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('writes an audit row for an owner change', async () => {
    await updateSetting({ userId: 'u', role: Role.SUPER_ADMIN }, 'fees.graceDays', 5);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'SETTING_CHANGED', organizationId: 'org', actorId: 'u', metadata: { key: 'fees.graceDays', before: 10, after: 5 } }) });
  });
});
