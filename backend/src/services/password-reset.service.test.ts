import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  userFind: vi.fn(), userUpdate: vi.fn(), tokenDelete: vi.fn(), auditCount: vi.fn(), auditCreate: vi.fn(),
  lock: vi.fn(), hash: vi.fn(), stepUp: vi.fn(), settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => {
  const tx = { user: { findUnique: m.userFind, update: m.userUpdate }, refreshToken: { deleteMany: m.tokenDelete }, auditLog: { count: m.auditCount, create: m.auditCreate } };
  return { prisma: { user: { findUnique: m.userFind }, $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } };
});
vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: m.lock }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/auth.service', () => ({ verifyActorPassword: m.stepUp }));
vi.mock('bcryptjs', () => ({ default: { hash: m.hash } }));

import { resetPassword } from './password-reset.service';

const ALL_ACTIONS = ['ROLE_CHANGE', 'STAFF_DEACTIVATE', 'STAFF_CREATE', 'STAFF_PASSWORD_RESET', 'ERASURE'];
const target = (role: Role, over: Record<string, unknown> = {}) => ({ id: 'target', role, deletedAt: null, organizationId: 'org', ...over });
const actorOf = (role: Role) => ({ userId: 'actor', role });
const ctx = { ip: '10.0.0.1', userAgent: 'test' };
const input = { identityCheck: 'IN_PERSON_CARD' as const };

beforeEach(() => {
  vi.resetAllMocks();
  m.settings = {
    'identity.tempPassword.length': 12, 'identity.reset.maxPerActorPerDay': 40, 'identity.reset.maxPerTargetPer24h': 3,
    'identity.stepUp.required': true, 'identity.stepUp.actions': ALL_ACTIONS,
  };
  m.userFind.mockResolvedValue(target(Role.STUDENT));
  m.hash.mockResolvedValue('hashed');
  m.auditCount.mockResolvedValue(0);
  m.userUpdate.mockResolvedValue({});
});

describe('who may reset whom', () => {
  it.each([
    [Role.ADMIN, Role.STUDENT, true],
    [Role.ADMIN, Role.TEACHER, false],
    [Role.ADMIN, Role.MARKER, false],
    [Role.ADMIN, Role.ADMIN, false],
    [Role.ADMIN, Role.SUPER_ADMIN, false],
    [Role.SUPER_ADMIN, Role.STUDENT, true],
    [Role.SUPER_ADMIN, Role.TEACHER, true],
    [Role.SUPER_ADMIN, Role.MARKER, true],
    [Role.SUPER_ADMIN, Role.ADMIN, true],
    [Role.SUPER_ADMIN, Role.SUPER_ADMIN, false],
  ])('actor %s on target %s: allowed=%s', async (actorRole, targetRole, allowed) => {
    m.userFind.mockResolvedValue(target(targetRole));
    const run = resetPassword('target', { ...input, currentPassword: 'actor-secret' }, actorOf(actorRole), ctx);
    if (allowed) await expect(run).resolves.toMatchObject({ temporaryPassword: expect.any(String) });
    else await expect(run).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses a %s actor even if the route guard is bypassed', async (role) => {
    await expect(resetPassword('target', input, actorOf(role), ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.userFind).not.toHaveBeenCalled();
  });

  it('refuses a reset of the actor own account', async () => {
    m.userFind.mockResolvedValue(target(Role.STUDENT, { id: 'actor' }));
    await expect(resetPassword('actor', input, actorOf(Role.ADMIN), ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('answers 404 for an unknown target before any role or step-up check', async () => {
    m.userFind.mockResolvedValue(null);
    await expect(resetPassword('target', input, actorOf(Role.ADMIN), ctx)).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
    expect(m.stepUp).not.toHaveBeenCalled();
  });

  it('refuses a deactivated target', async () => {
    m.userFind.mockResolvedValue(target(Role.STUDENT, { deletedAt: new Date() }));
    await expect(resetPassword('target', input, actorOf(Role.ADMIN), ctx)).rejects.toMatchObject({ code: 'ACCOUNT_DEACTIVATED', statusCode: 409 });
    expect(m.userUpdate).not.toHaveBeenCalled();
  });

  it('re-checks the role under the lock, so a role change since the first read cannot widen the reset', async () => {
    m.userFind.mockResolvedValueOnce(target(Role.STUDENT)).mockResolvedValueOnce(target(Role.TEACHER));
    await expect(resetPassword('target', input, actorOf(Role.ADMIN), ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.userUpdate).not.toHaveBeenCalled();
  });
});

describe('owner step-up for staff targets', () => {
  beforeEach(() => m.userFind.mockResolvedValue(target(Role.TEACHER)));

  it('requires the actor password for a staff target', async () => {
    await expect(resetPassword('target', input, actorOf(Role.SUPER_ADMIN), ctx)).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED', statusCode: 403 });
    expect(m.userUpdate).not.toHaveBeenCalled();
  });

  it('refuses a wrong actor password without changing anything', async () => {
    m.stepUp.mockRejectedValue(Object.assign(new Error('x'), { code: 'ACTOR_PASSWORD_INVALID', statusCode: 403 }));
    await expect(resetPassword('target', { ...input, currentPassword: 'bad' }, actorOf(Role.SUPER_ADMIN), ctx)).rejects.toMatchObject({ code: 'ACTOR_PASSWORD_INVALID' });
    expect(m.userUpdate).not.toHaveBeenCalled();
    expect(m.hash).not.toHaveBeenCalled();
  });

  it('checks the actor password against the actor, then proceeds', async () => {
    await resetPassword('target', { ...input, currentPassword: 'good' }, actorOf(Role.SUPER_ADMIN), ctx);
    expect(m.stepUp).toHaveBeenCalledWith('actor', 'good');
  });

  it('does not ask for it when the owner turned the step-up off or removed this action', async () => {
    m.settings['identity.stepUp.required'] = false;
    await resetPassword('target', input, actorOf(Role.SUPER_ADMIN), ctx);
    m.settings['identity.stepUp.required'] = true;
    m.settings['identity.stepUp.actions'] = ['ROLE_CHANGE'];
    await resetPassword('target', input, actorOf(Role.SUPER_ADMIN), ctx);
    expect(m.stepUp).not.toHaveBeenCalled();
  });

  it('never asks a student reset for the actor password', async () => {
    m.userFind.mockResolvedValue(target(Role.STUDENT));
    await resetPassword('target', input, actorOf(Role.ADMIN), ctx);
    expect(m.stepUp).not.toHaveBeenCalled();
  });

  it('does not reach the step-up when the role rule already refuses (front desk on staff)', async () => {
    await expect(resetPassword('target', { ...input, currentPassword: 'x' }, actorOf(Role.ADMIN), ctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(m.stepUp).not.toHaveBeenCalled();
  });
});

describe('a target whose role changes during the request', () => {
  it('refuses instead of resetting a staff account that was checked as a student, so the step-up cannot be skipped', async () => {
    m.userFind.mockResolvedValueOnce(target(Role.STUDENT)).mockResolvedValueOnce(target(Role.TEACHER));
    await expect(resetPassword('target', input, actorOf(Role.SUPER_ADMIN), ctx)).rejects.toMatchObject({ code: 'TARGET_CHANGED', statusCode: 409 });
    expect(m.userUpdate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });
});

describe('reset limits', () => {
  it('refuses when the actor reached the daily limit', async () => {
    m.auditCount.mockResolvedValueOnce(40);
    await expect(resetPassword('target', input, actorOf(Role.ADMIN), ctx)).rejects.toMatchObject({ code: 'RESET_LIMIT_ACTOR', statusCode: 429 });
    expect(m.userUpdate).not.toHaveBeenCalled();
  });

  it('refuses when the target reached its 24 hour limit', async () => {
    m.auditCount.mockResolvedValueOnce(0).mockResolvedValueOnce(3);
    await expect(resetPassword('target', input, actorOf(Role.ADMIN), ctx)).rejects.toMatchObject({ code: 'RESET_LIMIT_TARGET', statusCode: 429 });
    expect(m.userUpdate).not.toHaveBeenCalled();
  });

  it('allows one below each limit and counts only this action in the last 24 hours', async () => {
    m.auditCount.mockResolvedValueOnce(39).mockResolvedValueOnce(2);
    await expect(resetPassword('target', input, actorOf(Role.ADMIN), ctx)).resolves.toBeTruthy();
    const [actorQuery, targetQuery] = m.auditCount.mock.calls.map((call) => call[0].where);
    expect(actorQuery).toMatchObject({ action: 'PASSWORD_RESET_BY_STAFF', actorId: 'actor', createdAt: { gte: expect.any(Date) } });
    expect(targetQuery).toMatchObject({ action: 'PASSWORD_RESET_BY_STAFF', targetType: 'User', targetId: 'target', createdAt: { gte: expect.any(Date) } });
    const since = (actorQuery.createdAt.gte as Date).getTime();
    expect(Date.now() - since).toBeGreaterThan(24 * 3600 * 1000 - 5000);
    expect(Date.now() - since).toBeLessThan(24 * 3600 * 1000 + 5000);
  });

  it('takes the lock before counting, so concurrent resets cannot both pass', async () => {
    await resetPassword('target', input, actorOf(Role.ADMIN), ctx);
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.auditCount.mock.invocationCallOrder[0]!);
    expect(m.lock).toHaveBeenCalledWith(expect.anything(), 'password-reset', 'org', 'reset');
  });
});

describe('a successful reset', () => {
  it('sets a hashed temporary password, forces a change, ends every session and never touches the cooldown anchor', async () => {
    const result = await resetPassword('target', input, actorOf(Role.ADMIN), ctx);
    expect(result.temporaryPassword).toHaveLength(12);
    expect(m.hash).toHaveBeenCalledWith(result.temporaryPassword, 12);
    const update = m.userUpdate.mock.calls[0]![0];
    expect(update.where).toEqual({ id: 'target' });
    expect(update.data).toEqual({ password: 'hashed', mustChangePassword: true, tokenVersion: { increment: 1 } });
    expect(m.tokenDelete).toHaveBeenCalledWith({ where: { userId: 'target' } });
  });

  it('writes the audit row with the actor, target and identity check only, and no secret anywhere', async () => {
    const result = await resetPassword('target', { ...input, identityCheck: 'GUARDIAN_PHONE' }, actorOf(Role.ADMIN), ctx);
    expect(m.auditCreate).toHaveBeenCalledWith({ data: {
      action: 'PASSWORD_RESET_BY_STAFF', description: 'Password reset by staff', targetType: 'User', targetId: 'target',
      metadata: { identityCheck: 'GUARDIAN_PHONE' }, ip: '10.0.0.1', userAgent: 'test', actorId: 'actor', actorRole: Role.ADMIN, organizationId: 'org',
    } });
    const everythingStored = JSON.stringify([m.auditCreate.mock.calls, m.userUpdate.mock.calls, m.tokenDelete.mock.calls]);
    expect(everythingStored).not.toContain(result.temporaryPassword);
  });

  it('uses the configured length', async () => {
    m.settings['identity.tempPassword.length'] = 16;
    expect((await resetPassword('target', input, actorOf(Role.ADMIN), ctx)).temporaryPassword).toHaveLength(16);
  });

  it('does not write anything when a limit refuses', async () => {
    m.auditCount.mockResolvedValue(99);
    await resetPassword('target', input, actorOf(Role.ADMIN), ctx).catch(() => undefined);
    expect(m.userUpdate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
    expect(m.tokenDelete).not.toHaveBeenCalled();
  });
});
