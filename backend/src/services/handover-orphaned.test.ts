import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  userFind: vi.fn(), listDependencies: vi.fn(), listOrphaned: vi.fn(), reassign: vi.fn(), audit: vi.fn(),
  userFindMany: vi.fn(), slotFindMany: vi.fn(), settings: {} as Record<string, unknown>,
}));
const tx = { user: { findMany: m.userFindMany }, timetableSlot: { findMany: m.slotFindMany } };

vi.mock('@/config/database', () => ({ prisma: { user: { findUnique: m.userFind }, $transaction: async (run: (client: unknown) => unknown) => run(tx) } }));
vi.mock('@/services/handover-dependencies.service', () => ({ listHandoverDependencies: m.listDependencies, listOrphanedClasses: m.listOrphaned }));
vi.mock('@/services/class.service', () => ({ reassignCourseTeacher: m.reassign }));
vi.mock('@/services/audit.service', () => ({ logInTransaction: m.audit }));
vi.mock('@/services/settings.service', () => ({
  createSettingsReader: () => async (key: string) => m.settings[key],
  organizationForUser: async () => 'org',
}));

import { getOrphanedClasses, handOverOrphaned } from './handover.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const ctx = { actorId: 'owner', actorRole: 'SUPER_ADMIN' };
const leaver = (over: Record<string, unknown> = {}) => ({ role: Role.TEACHER, deletedAt: new Date('2026-10-01'), organizationId: 'org', ...over });
const course = { id: 'c1', name: 'Physics 2026', year: 2026, subjectName: 'Physics', isActive: true, upcomingSessions: 0, openExams: 0 };
const code = (promise: Promise<unknown>) => promise.then(() => 'allowed', (error: { code: string }) => error.code);

beforeEach(() => {
  vi.resetAllMocks();
  m.settings = { 'identity.handoverLookaheadDays': 14, 'handover.defaultEffectiveMonth': 'NEXT' };
  m.userFind.mockResolvedValue(leaver());
  m.listDependencies.mockResolvedValue({ courses: [course], markerAllocations: [] });
  m.userFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ({ id }))));
  m.slotFindMany.mockResolvedValue([]);
  m.audit.mockResolvedValue(undefined);
});

describe('GET orphaned classes', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('is for the owner only, not %s', async (role) => {
    expect(await code(getOrphanedClasses({ userId: 'u', role }))).toBe('FORBIDDEN');
    expect(m.listOrphaned).not.toHaveBeenCalled();
  });

  it('lists the owner\'s organization', async () => {
    m.listOrphaned.mockResolvedValue([{ teacher: { id: 't1' }, courses: [] }]);
    expect(await getOrphanedClasses(owner)).toHaveLength(1);
    expect(m.listOrphaned).toHaveBeenCalledWith('org');
  });
});

describe('handing over the classes of an account that already left', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('is for the owner only, not %s', async (role) => {
    expect(await code(handOverOrphaned('t1', { handoverAllTo: 't2' }, { userId: 'u', role }, ctx))).toBe('FORBIDDEN');
    expect(m.userFind).not.toHaveBeenCalled();
  });

  it('answers 404 for an account that does not exist', async () => {
    m.userFind.mockResolvedValue(null);
    expect(await code(handOverOrphaned('gone', { handoverAllTo: 't2' }, owner, ctx))).toBe('USER_NOT_FOUND');
  });

  it('refuses a teacher who is still working: their classes move with the deactivation or role change', async () => {
    m.userFind.mockResolvedValue(leaver({ deletedAt: null }));
    expect(await code(handOverOrphaned('t1', { handoverAllTo: 't2' }, owner, ctx))).toBe('TEACHER_STILL_ACTIVE');
    expect(m.reassign).not.toHaveBeenCalled();
  });

  it.each([['a deactivated teacher', leaver()], ['a teacher moved to another role', leaver({ deletedAt: null, role: Role.MARKER })]])('moves the classes of %s and records it', async (_name, row) => {
    m.userFind.mockResolvedValue(row);

    const result = await handOverOrphaned('t1', { handoverAllTo: 't2' }, owner, ctx);

    expect(result.handedOver).toEqual([{ courseId: 'c1', courseName: 'Physics 2026', toTeacherId: 't2' }]);
    expect(m.reassign).toHaveBeenCalledWith(tx, 'c1', 't2');
    expect(m.audit).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'CLASSES_HANDED_OVER', targetId: 't1', organizationId: 'org', context: ctx,
      metadata: { handedOver: [{ courseId: 'c1', courseName: 'Physics 2026', toTeacherId: 't2' }], effectiveMonth: 'NEXT' },
    }));
  });

  it('does not refuse on marking: the account already left', async () => {
    m.listDependencies.mockResolvedValue({ courses: [course], markerAllocations: [{ examId: 'e1', examTitle: 'T', courseName: 'P' }] });
    expect(await code(handOverOrphaned('t1', { handoverAllTo: 't2' }, owner, ctx))).toBe('allowed');
  });

  it('refuses a receiver that is not an active teacher, moving and recording nothing', async () => {
    m.userFindMany.mockResolvedValue([]);
    expect(await code(handOverOrphaned('t1', { handoverAllTo: 'student' }, owner, ctx))).toBe('INVALID_HANDOVER_TARGET');
    expect(m.reassign).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('is a repeat when nothing is left: it succeeds and writes no audit row', async () => {
    m.listDependencies.mockResolvedValue({ courses: [], markerAllocations: [] });
    expect(await handOverOrphaned('t1', { handoverAllTo: 't2' }, owner, ctx)).toEqual({ handedOver: [] });
    expect(m.audit).not.toHaveBeenCalled();
  });
});
