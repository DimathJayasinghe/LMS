import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const m = vi.hoisted(() => ({
  find: vi.fn(), update: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), transaction: vi.fn(),
  lock: vi.fn(), applyHandover: vi.fn(), audit: vi.fn(), stepUp: vi.fn(), settings: {} as Record<string, unknown>,
}));
const tx = { user: { findUnique: m.find, update: m.update, count: m.count }, refreshToken: { deleteMany: m.deleteMany } };

vi.mock('@/config/database', () => ({ prisma: { user: { findUnique: m.find }, $transaction: m.transaction } }));
vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: m.lock }));
vi.mock('@/services/handover.service', () => ({ applyHandover: m.applyHandover }));
vi.mock('@/services/audit.service', () => ({ logInTransaction: m.audit }));
vi.mock('@/services/auth.service', () => ({ verifyActorPassword: m.stepUp }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));

import { updateRole, updateStatus } from './account-change.service';

const ctx = { actorId: 'actor', actorRole: 'SUPER_ADMIN', ip: '10.0.0.1', userAgent: 'test' };
const target = (over: Partial<{ id: string; role: Role; deletedAt: Date | null }> = {}) => ({
  id: 'target', name: 'Target', role: Role.STUDENT, organizationId: 'org', deletedAt: null as Date | null, ...over,
});
const as = (role: Role) => ({ userId: 'actor', role });
const status = (isActive: boolean, extra: Record<string, unknown> = {}) => ({ isActive, ...extra }) as never;
const roleTo = (role: Role, extra: Record<string, unknown> = {}) => ({ role, reason: 'Moved to the front desk', ...extra }) as never;
const code = (promise: Promise<unknown>) => promise.then(() => 'allowed', (error: { code: string }) => error.code);

beforeEach(() => {
  vi.resetAllMocks();
  m.settings = {
    'identity.stepUp.required': false, 'identity.stepUp.actions': ['ROLE_CHANGE', 'STAFF_DEACTIVATE'],
    'identity.roleChange.reasonRequired': true, 'identity.staffDeactivate.requireHandover': true,
    'identity.handoverLookaheadDays': 14, 'handover.defaultEffectiveMonth': 'NEXT',
  };
  m.find.mockResolvedValue(target());
  m.update.mockImplementation(async ({ data }: { data: { role?: Role } }) => target({ role: data.role }));
  m.count.mockResolvedValue(2);
  m.deleteMany.mockResolvedValue({ count: 1 });
  m.lock.mockResolvedValue(undefined);
  m.applyHandover.mockResolvedValue([]);
  m.audit.mockResolvedValue(undefined);
  m.stepUp.mockResolvedValue(undefined);
  m.transaction.mockImplementation(async (run: (client: typeof tx) => unknown) => run(tx));
});

describe('the actor x target x has-classes matrix, every cell', () => {
  const OPS = ['deactivate', 'reactivate', Role.ADMIN, Role.TEACHER, Role.MARKER] as const;
  const cells = [Role.SUPER_ADMIN, Role.ADMIN].flatMap((actor) =>
    [Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT].flatMap((targetRole) =>
      [false, true].flatMap((hasClasses) => OPS.map((op) => ({ actor, targetRole, hasClasses, op })))));

  const expected = ({ actor, targetRole, hasClasses, op }: (typeof cells)[number]): string => {
    const isStatus = op === 'deactivate' || op === 'reactivate';
    if (actor === Role.ADMIN && (targetRole === Role.ADMIN || targetRole === Role.SUPER_ADMIN)) return 'FORBIDDEN';
    if (isStatus && actor === Role.ADMIN && targetRole !== Role.STUDENT) return 'FORBIDDEN';
    if (!isStatus && actor === Role.ADMIN) return 'FORBIDDEN';
    if (!isStatus && targetRole === Role.STUDENT) return 'ROLE_CHANGE_NOT_ALLOWED';
    const leaves = op === 'deactivate' || (!isStatus && op !== targetRole);
    if (leaves && hasClasses && (targetRole === Role.TEACHER || targetRole === Role.MARKER)) return 'TEACHER_HAS_CLASSES';
    return 'allowed';
  };

  it.each(cells)('$actor / target $targetRole / classes $hasClasses / $op', async (cell) => {
    m.find.mockResolvedValue(target({ role: cell.targetRole }));
    m.applyHandover.mockImplementation(async () => {
      if (cell.hasClasses) throw new AppError('TEACHER_HAS_CLASSES', 409, 'Hand over first.');
      return [];
    });
    const call = cell.op === 'deactivate' || cell.op === 'reactivate'
      ? updateStatus('target', status(cell.op === 'reactivate'), as(cell.actor), ctx)
      : updateRole('target', roleTo(cell.op), as(cell.actor), ctx);

    expect(await code(call)).toBe(expected(cell));
  });
});

describe('check ordering', () => {
  it('refuses the front desk before any password check, hand-over or write, so nothing about the target leaks', async () => {
    m.settings['identity.stepUp.required'] = true;
    m.find.mockResolvedValue(target({ role: Role.TEACHER }));

    expect(await code(updateStatus('target', status(false, { currentPassword: 'x' }), as(Role.ADMIN), ctx))).toBe('FORBIDDEN');
    expect(m.stepUp).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.applyHandover).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing target before anything else', async () => {
    m.find.mockResolvedValue(null);
    expect(await code(updateStatus('missing', status(false), as(Role.SUPER_ADMIN), ctx))).toBe('USER_NOT_FOUND');
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it('puts the privileged-target message ahead of the self refusal', async () => {
    m.find.mockResolvedValue(target({ id: 'actor', role: Role.ADMIN }));
    await expect(updateRole('actor', roleTo(Role.TEACHER), as(Role.ADMIN), ctx)).rejects.toMatchObject({ message: 'Only a super admin can modify an admin or super admin account.' });
  });

  it.each(['deactivate', 'reactivate', 'role'] as const)('refuses an owner changing their own account (%s)', async (op) => {
    m.find.mockResolvedValue(target({ id: 'actor', role: Role.SUPER_ADMIN }));
    const call = op === 'role' ? updateRole('actor', roleTo(Role.TEACHER), as(Role.SUPER_ADMIN), ctx) : updateStatus('actor', status(op === 'reactivate'), as(Role.SUPER_ADMIN), ctx);
    expect(await code(call)).toBe('FORBIDDEN');
    expect(m.update).not.toHaveBeenCalled();
  });

  it('checks the last-owner rule before it looks at hand-over', async () => {
    m.find.mockResolvedValue(target({ role: Role.SUPER_ADMIN }));
    m.count.mockResolvedValue(1);
    expect(await code(updateStatus('target', status(false), as(Role.SUPER_ADMIN), ctx))).toBe('LAST_OWNER');
    expect(m.applyHandover).not.toHaveBeenCalled();
  });
});

describe('the reason and the step-up password', () => {
  it('needs a reason for a role change when the organization requires one', async () => {
    m.find.mockResolvedValue(target({ role: Role.MARKER }));
    expect(await code(updateRole('target', { role: Role.TEACHER } as never, as(Role.SUPER_ADMIN), ctx))).toBe('REASON_REQUIRED');
    m.settings['identity.roleChange.reasonRequired'] = false;
    expect(await code(updateRole('target', { role: Role.TEACHER } as never, as(Role.SUPER_ADMIN), ctx))).toBe('allowed');
  });

  it('asks the owner for their own password to change a role, and checks it against the actor', async () => {
    m.settings['identity.stepUp.required'] = true;
    m.find.mockResolvedValue(target({ role: Role.MARKER }));

    expect(await code(updateRole('target', roleTo(Role.TEACHER), as(Role.SUPER_ADMIN), ctx))).toBe('STEP_UP_REQUIRED');
    expect(m.update).not.toHaveBeenCalled();

    await updateRole('target', roleTo(Role.TEACHER, { currentPassword: 'owner-secret' }), as(Role.SUPER_ADMIN), ctx);
    expect(m.stepUp).toHaveBeenCalledWith('actor', 'owner-secret');
  });

  it('stops on a wrong password without touching the account', async () => {
    m.settings['identity.stepUp.required'] = true;
    m.find.mockResolvedValue(target({ role: Role.TEACHER }));
    m.stepUp.mockRejectedValue(new AppError('ACTOR_PASSWORD_INVALID', 403, 'Your password is incorrect.'));

    expect(await code(updateStatus('target', status(false, { currentPassword: 'wrong' }), as(Role.SUPER_ADMIN), ctx))).toBe('ACTOR_PASSWORD_INVALID');
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['a staff deactivation', Role.TEACHER, false, true],
    ['a student deactivation', Role.STUDENT, false, false],
    ['a staff reactivation', Role.TEACHER, true, false],
  ])('%s %s need the password', async (_name, role, isActive, needed) => {
    m.settings['identity.stepUp.required'] = true;
    m.find.mockResolvedValue(target({ role, deletedAt: isActive ? new Date() : null }));
    expect(await code(updateStatus('target', status(isActive), as(Role.SUPER_ADMIN), ctx))).toBe(needed ? 'STEP_UP_REQUIRED' : 'allowed');
  });

  it('skips the password when the owner switched the step-up for this action off', async () => {
    m.settings['identity.stepUp.required'] = true;
    m.settings['identity.stepUp.actions'] = ['STAFF_CREATE'];
    m.find.mockResolvedValue(target({ role: Role.MARKER }));
    expect(await code(updateRole('target', roleTo(Role.TEACHER), as(Role.SUPER_ADMIN), ctx))).toBe('allowed');
  });
});

describe('hand-over inside the same change', () => {
  const leaving = () => m.find.mockResolvedValue(target({ role: Role.TEACHER }));

  it('runs the hand-over in the transaction with the request, the organization and the settings', async () => {
    leaving();
    await updateStatus('target', status(false, { handoverAllTo: 't2', handover: [{ courseId: 'c1', toTeacherId: 't3' }] }), as(Role.SUPER_ADMIN), ctx);

    expect(m.applyHandover).toHaveBeenCalledWith(
      tx, { id: 'target', organizationId: 'org' }, { handoverAllTo: 't2', handover: [{ courseId: 'c1', toTeacherId: 't3' }] },
      { lookaheadDays: 14, now: expect.any(Date), required: true, refuseOpenMarking: true },
    );
  });

  it('changes nothing when the hand-over fails: no status write, no sessions ended, no audit row', async () => {
    leaving();
    m.applyHandover.mockRejectedValue(new AppError('HANDOVER_SLOT_CONFLICT', 409, 'Clash.'));

    expect(await code(updateStatus('target', status(false), as(Role.SUPER_ADMIN), ctx))).toBe('HANDOVER_SLOT_CONFLICT');
    expect(m.update).not.toHaveBeenCalled();
    expect(m.deleteMany).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it.each([[Role.TEACHER, Role.MARKER, true], [Role.MARKER, Role.TEACHER, true], [Role.ADMIN, Role.TEACHER, false]])('a role change from %s to %s %s hand over', async (from, to, runs) => {
    m.find.mockResolvedValue(target({ role: from }));
    await updateRole('target', roleTo(to), as(Role.SUPER_ADMIN), ctx);
    expect(m.applyHandover).toHaveBeenCalledTimes(runs ? 1 : 0);
  });

  it.each([Role.STUDENT, Role.ADMIN])('never looks for classes on a %s account', async (role) => {
    m.find.mockResolvedValue(target({ role }));
    await updateStatus('target', status(false), as(Role.SUPER_ADMIN), ctx);
    expect(m.applyHandover).not.toHaveBeenCalled();
  });

  it('records what moved, the reason and the month in the audit row, in the same transaction', async () => {
    leaving();
    m.applyHandover.mockResolvedValue([{ courseId: 'c1', courseName: 'Physics', toTeacherId: 't2' }]);

    const result = await updateStatus('target', status(false, { reason: 'Left the institute', effectiveMonth: 'CURRENT' }), as(Role.SUPER_ADMIN), ctx);

    expect(result.handedOver).toEqual([{ courseId: 'c1', courseName: 'Physics', toTeacherId: 't2' }]);
    expect(m.audit).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'USER_DEACTIVATED', targetType: 'User', targetId: 'target', organizationId: 'org', context: ctx,
      metadata: { reason: 'Left the institute', role: Role.TEACHER, handedOver: [{ courseId: 'c1', courseName: 'Physics', toTeacherId: 't2' }], effectiveMonth: 'CURRENT' },
    }));
  });

  it('takes the effective month from the organization setting when the request names none', async () => {
    leaving();
    m.applyHandover.mockResolvedValue([{ courseId: 'c1', courseName: 'Physics', toTeacherId: 't2' }]);
    await updateStatus('target', status(false), as(Role.SUPER_ADMIN), ctx);
    expect(m.audit.mock.calls[0]![1].metadata.effectiveMonth).toBe('NEXT');
  });
});

describe('what a change does to the account', () => {
  it('ends every session on a role change and on a deactivation, but not on a reactivation', async () => {
    m.find.mockResolvedValue(target({ role: Role.MARKER }));
    await updateRole('target', roleTo(Role.TEACHER), as(Role.SUPER_ADMIN), ctx);
    expect(m.update.mock.calls[0]![0].data).toEqual({ role: Role.TEACHER, tokenVersion: { increment: 1 } });
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target' } });

    m.deleteMany.mockClear();
    m.find.mockResolvedValue(target({ role: Role.STUDENT, deletedAt: new Date() }));
    await updateStatus('target', status(true), as(Role.SUPER_ADMIN), ctx);
    expect(m.update.mock.calls[1]![0].data).toEqual({ deletedAt: null });
    expect(m.deleteMany).not.toHaveBeenCalled();
  });

  it('writes the role change audit row with before, after and the reason', async () => {
    m.find.mockResolvedValue(target({ role: Role.MARKER }));
    await updateRole('target', roleTo(Role.TEACHER), as(Role.SUPER_ADMIN), ctx);
    expect(m.audit).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'ROLE_CHANGED', description: 'Role changed from MARKER to TEACHER',
      metadata: { before: { role: Role.MARKER }, after: { role: Role.TEACHER }, reason: 'Moved to the front desk' },
    }));
  });

  it('records a reactivation too', async () => {
    m.find.mockResolvedValue(target({ deletedAt: new Date() }));
    await updateStatus('target', status(true), as(Role.SUPER_ADMIN), ctx);
    expect(m.audit).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'USER_ACTIVATED' }));
  });

  it.each([
    ['deactivating an account that is already deactivated', () => updateStatus('target', status(false), as(Role.SUPER_ADMIN), ctx), { deletedAt: new Date() }],
    ['reactivating an active account', () => updateStatus('target', status(true), as(Role.SUPER_ADMIN), ctx), {}],
    ['asking for the role the account already has', () => updateRole('target', roleTo(Role.MARKER), as(Role.SUPER_ADMIN), ctx), { role: Role.MARKER }],
  ])('%s is a repeat: it succeeds and changes, ends and records nothing', async (_name, run, over) => {
    m.find.mockResolvedValue(target(over));
    const result = await run();
    expect(result.changed).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.deleteMany).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
    expect(m.applyHandover).not.toHaveBeenCalled();
  });

  it('serialises on the owner lock before it reads the account it is about to change', async () => {
    await updateStatus('target', status(false), as(Role.SUPER_ADMIN), ctx);
    expect(m.lock).toHaveBeenCalledWith(tx, 'owner', 'org', 'owner');
  });
});

describe('owner safeguards', () => {
  it('refuses to demote the last active owner and allows it when another remains', async () => {
    m.find.mockResolvedValue(target({ role: Role.SUPER_ADMIN }));
    m.count.mockResolvedValue(1);
    expect(await code(updateRole('target', roleTo(Role.TEACHER), as(Role.SUPER_ADMIN), ctx))).toBe('LAST_OWNER');
    m.count.mockResolvedValue(2);
    expect(await code(updateRole('target', roleTo(Role.TEACHER), as(Role.SUPER_ADMIN), ctx))).toBe('allowed');
  });

  it('never assigns the owner role, even if the schema were bypassed', async () => {
    m.find.mockResolvedValue(target({ role: Role.MARKER }));
    expect(await code(updateRole('target', roleTo(Role.SUPER_ADMIN), as(Role.SUPER_ADMIN), ctx))).toBe('FORBIDDEN');
  });

  it('serialises two owners demoting each other so one active owner remains', async () => {
    const users = new Map([['a', target({ id: 'a', role: Role.SUPER_ADMIN })], ['b', target({ id: 'b', role: Role.SUPER_ADMIN })]]);
    let tail = Promise.resolve();
    m.find.mockImplementation(async ({ where }: { where: { id: string } }) => users.get(where.id));
    m.transaction.mockImplementation(async (run: (client: unknown) => Promise<unknown>) => {
      let release = () => {};
      const local = {
        ...tx,
        user: {
          findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id),
          count: async () => [...users.values()].filter((user) => user.role === Role.SUPER_ADMIN).length,
          update: async ({ where, data }: { where: { id: string }; data: { role: Role } }) => Object.assign(users.get(where.id)!, { role: data.role }),
        },
      };
      m.lock.mockImplementationOnce(async () => { const previous = tail; tail = new Promise<void>((resolve) => { release = resolve; }); await previous; });
      try { return await run(local); } finally { release(); }
    });

    const results = await Promise.allSettled([
      updateRole('b', roleTo(Role.TEACHER), { userId: 'a', role: Role.SUPER_ADMIN }, ctx),
      updateRole('a', roleTo(Role.TEACHER), { userId: 'b', role: Role.SUPER_ADMIN }, ctx),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'LAST_OWNER' } });
  });
});
