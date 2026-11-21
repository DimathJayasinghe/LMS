import { beforeEach, describe, expect, it, vi } from 'vitest';

const { userFindUnique } = vi.hoisted(() => ({ userFindUnique: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: { user: { findUnique: userFindUnique } } }));

import { organizationClockForUser } from './organization-clock.service';

beforeEach(() => { userFindUnique.mockReset(); });

describe('organizationClockForUser', () => {
  it('returns the organization id and its time zone', async () => {
    userFindUnique.mockResolvedValue({ organizationId: 'org', organization: { timezone: 'Asia/Colombo' } });
    await expect(organizationClockForUser('u1')).resolves.toEqual({ organizationId: 'org', timezone: 'Asia/Colombo' });
    expect(userFindUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { organizationId: true, organization: { select: { timezone: true } } } });
  });

  it.each([null, { organizationId: null, organization: null }, { organizationId: 'org', organization: null }])('answers 404 when the user has no organization (%j)', async (row) => {
    userFindUnique.mockResolvedValue(row);
    await expect(organizationClockForUser('u1')).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND', statusCode: 404 });
  });
});
