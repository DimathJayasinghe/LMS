import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  userFind: vi.fn(), userCreate: vi.fn(), logInTransaction: vi.fn(), stepUp: vi.fn(), hash: vi.fn(),
  committed: [] as unknown[], settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => ({
  prisma: {
    user: { findUnique: m.userFind },
    // A real transaction keeps nothing when its callback throws; the mock models that so rollback can be asserted.
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const staged: unknown[] = [];
      const tx = { user: { create: (args: unknown) => { staged.push(args); return m.userCreate(args); } } };
      const result = await run(tx);
      m.committed.push(...staged);
      return result;
    },
  },
}));
vi.mock('@/services/settings.service', () => ({
  createSettingsReader: () => async (key: string) => m.settings[key],
  organizationForUser: async () => 'org',
}));
vi.mock('@/services/auth.service', () => ({ verifyActorPassword: m.stepUp }));
vi.mock('@/services/audit.service', () => ({ logInTransaction: m.logInTransaction }));
vi.mock('bcryptjs', () => ({ default: { hash: m.hash } }));

import { createStaff } from './staff-account.service';

const ALL_ACTIONS = ['ROLE_CHANGE', 'STAFF_DEACTIVATE', 'STAFF_CREATE', 'STAFF_PASSWORD_RESET', 'ERASURE'];
const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const ctx = { actorId: 'owner', actorRole: 'SUPER_ADMIN', ip: '10.0.0.1', userAgent: 'test' };
const input = (over: Record<string, unknown> = {}) => ({
  name: 'Nimal Perera', email: 'nimal@example.com', role: Role.TEACHER, currentPassword: 'owner-secret', ...over,
}) as Parameters<typeof createStaff>[0];

beforeEach(() => {
  vi.resetAllMocks();
  m.committed.length = 0;
  m.settings = {
    'identity.tempPassword.length': 12, 'identity.stepUp.required': true, 'identity.stepUp.actions': ALL_ACTIONS,
  };
  m.userFind.mockResolvedValue(null);
  m.userCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-user', name: data.name, email: data.email, role: data.role, phone: data.phone }));
  m.logInTransaction.mockResolvedValue(undefined);
  m.stepUp.mockResolvedValue(undefined);
  m.hash.mockResolvedValue('hashed');
});

describe('who may create staff accounts', () => {
  it('lets the owner create a teacher, front desk or marker', async () => {
    for (const role of [Role.TEACHER, Role.ADMIN, Role.MARKER]) {
      await expect(createStaff(input({ role }), owner, ctx)).resolves.toMatchObject({ user: { role } });
    }
  });

  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s even if the route guard is bypassed, before any lookup or hashing', async (role) => {
    await expect(createStaff(input(), { userId: 'a', role }, ctx)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.userFind).not.toHaveBeenCalled();
    expect(m.hash).not.toHaveBeenCalled();
    expect(m.stepUp).not.toHaveBeenCalled();
  });

  it.each([Role.SUPER_ADMIN, Role.STUDENT])('refuses to create a %s account here, whatever the request says', async (role) => {
    await expect(createStaff(input({ role }), owner, ctx)).rejects.toMatchObject({ code: 'INVALID_STAFF_ROLE', statusCode: 400 });
    expect(m.userCreate).not.toHaveBeenCalled();
  });
});

describe('step-up with the owner password', () => {
  it('requires the owner password when the owner kept the step-up on for this action', async () => {
    await expect(createStaff(input({ currentPassword: undefined }), owner, ctx)).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED', statusCode: 403 });
    expect(m.userCreate).not.toHaveBeenCalled();
  });

  it('checks the password against the acting owner', async () => {
    await createStaff(input(), owner, ctx);
    expect(m.stepUp).toHaveBeenCalledWith('owner', 'owner-secret');
  });

  it('stops when the password is wrong, before any duplicate lookup, hashing or write', async () => {
    m.stepUp.mockRejectedValue(Object.assign(new Error('x'), { code: 'ACTOR_PASSWORD_INVALID', statusCode: 403 }));
    await expect(createStaff(input(), owner, ctx)).rejects.toMatchObject({ code: 'ACTOR_PASSWORD_INVALID', statusCode: 403 });
    expect(m.userFind).not.toHaveBeenCalled();
    expect(m.hash).not.toHaveBeenCalled();
    expect(m.userCreate).not.toHaveBeenCalled();
  });

  it('does not ask for it when the owner turned the step-up off or removed this action', async () => {
    m.settings['identity.stepUp.required'] = false;
    await expect(createStaff(input({ currentPassword: undefined }), owner, ctx)).resolves.toBeTruthy();
    m.settings['identity.stepUp.required'] = true;
    m.settings['identity.stepUp.actions'] = ['ROLE_CHANGE'];
    await expect(createStaff(input({ currentPassword: undefined }), owner, ctx)).resolves.toBeTruthy();
    expect(m.stepUp).not.toHaveBeenCalled();
  });
});

describe('duplicate email', () => {
  it('answers 409 before hashing or writing', async () => {
    m.userFind.mockResolvedValue({ id: 'someone' });
    await expect(createStaff(input(), owner, ctx)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
    expect(m.hash).not.toHaveBeenCalled();
    expect(m.userCreate).not.toHaveBeenCalled();
    expect(m.userFind).toHaveBeenCalledWith({ where: { email: 'nimal@example.com' }, select: { id: true } });
  });

  it('answers 409 when another request took the address between the lookup and the write', async () => {
    m.userCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(createStaff(input(), owner, ctx)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
  });

  it('lets any other database error through unchanged', async () => {
    m.userCreate.mockRejectedValue(new Error('boom'));
    await expect(createStaff(input(), owner, ctx)).rejects.toThrow('boom');
  });
});

describe('a successful creation', () => {
  it('creates an active staff account that must change its password and skips student setup', async () => {
    await createStaff(input({ phone: '0771234567' }), owner, ctx);
    expect(m.userCreate).toHaveBeenCalledTimes(1);
    expect(m.userCreate.mock.calls[0]![0].data).toEqual({
      name: 'Nimal Perera', email: 'nimal@example.com', phone: '0771234567', role: Role.TEACHER,
      password: 'hashed', mustChangePassword: true, setupCompleted: true, organizationId: 'org',
    });
  });

  it('stores no phone when none was given', async () => {
    await createStaff(input(), owner, ctx);
    expect(m.userCreate.mock.calls[0]![0].data.phone).toBeNull();
  });

  it('returns the one-time password at the configured length, hashed with the shared cost', async () => {
    const result = await createStaff(input(), owner, ctx);
    expect(result.temporaryPassword).toHaveLength(12);
    expect(m.hash).toHaveBeenCalledWith(result.temporaryPassword, 12);
  });

  it('returns the account without the password hash', async () => {
    const result = await createStaff(input(), owner, ctx);
    expect(result.user).toEqual({ id: 'new-user', name: 'Nimal Perera', email: 'nimal@example.com', role: Role.TEACHER, phone: null });
    expect(JSON.stringify(result.user)).not.toContain('hashed');
  });

  it('selects only safe fields from the created row', async () => {
    await createStaff(input(), owner, ctx);
    expect(m.userCreate.mock.calls[0]![0].select).toEqual({ id: true, name: true, email: true, role: true, phone: true });
  });
});

describe('audit', () => {
  it('writes one row in the same transaction with the actor context, the new account and its role', async () => {
    await createStaff(input({ role: Role.MARKER }), owner, ctx);
    expect(m.logInTransaction).toHaveBeenCalledTimes(1);
    const [, auditInput] = m.logInTransaction.mock.calls[0]!;
    expect(auditInput).toMatchObject({
      action: 'STAFF_ACCOUNT_CREATED', targetType: 'User', targetId: 'new-user', organizationId: 'org',
      metadata: { role: Role.MARKER }, context: ctx,
    });
  });

  it('keeps the temporary password and its hash out of every stored row', async () => {
    const result = await createStaff(input(), owner, ctx);
    const stored = JSON.stringify(m.logInTransaction.mock.calls);
    expect(stored).not.toContain(result.temporaryPassword);
    expect(stored).not.toContain('hashed');
    expect(stored).not.toContain('owner-secret');
  });

  it('rolls the account back when the audit write fails', async () => {
    m.logInTransaction.mockRejectedValue(new Error('audit down'));
    await expect(createStaff(input(), owner, ctx)).rejects.toThrow('audit down');
    expect(m.userCreate).toHaveBeenCalledTimes(1);
    expect(m.committed).toEqual([]);
  });

  it('writes no audit row when the account was not created', async () => {
    m.userCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(createStaff(input(), owner, ctx)).rejects.toBeTruthy();
    expect(m.logInTransaction).not.toHaveBeenCalled();
  });
});
