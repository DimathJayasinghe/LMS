import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassType, Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  userFindFirst: vi.fn(), courseFindFirst: vi.fn(), unique: vi.fn(), other: vi.fn(), create: vi.fn(), update: vi.fn(),
  lock: vi.fn(), calls: [] as string[],
}));

vi.mock('@/config/database', () => ({
  prisma: {
    user: { findFirst: m.userFindFirst },
    course: { findFirst: m.courseFindFirst },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      enrollment: {
        findUnique: (a: unknown) => { m.calls.push('read-same-mode'); return m.unique(a); },
        findFirst: (a: unknown) => { m.calls.push('read-other-mode'); return m.other(a); },
        create: (a: unknown) => { m.calls.push('create'); return m.create(a); },
        update: (a: unknown) => { m.calls.push('update'); return m.update(a); },
      },
    }),
  },
}));
vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: (...args: unknown[]) => { m.calls.push('lock'); return m.lock(...args); } }));

import { createEnrollment } from './enrollment.service';

const STUDENT = '10000000-0000-4000-8000-000000000001';
const COURSE = '20000000-0000-4000-8000-000000000001';
const student = { userId: 'student-1', role: Role.STUDENT };
const desk = { userId: 'desk-1', role: Role.ADMIN };
const owner = { userId: 'owner-1', role: Role.SUPER_ADMIN };
const physical = { courseId: COURSE, classType: ClassType.PHYSICAL, userId: STUDENT };

beforeEach(() => {
  vi.clearAllMocks();
  m.calls.length = 0;
  m.userFindFirst.mockResolvedValue({ id: STUDENT, role: Role.STUDENT });
  m.courseFindFirst.mockResolvedValue({ id: COURSE, organizationId: 'org-1' });
  m.unique.mockResolvedValue(null);
  m.other.mockResolvedValue(null);
  m.create.mockResolvedValue({ id: 'enrollment-new' });
  m.update.mockResolvedValue({ id: 'enrollment-old' });
});

describe('createEnrollment — who is enrolled', () => {
  it.each([[desk], [owner]])('lets %j enrol a named student', async (actor) => {
    await expect(createEnrollment(physical, actor)).resolves.toEqual({ id: 'enrollment-new' });
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ data: { userId: STUDENT, courseId: COURSE, classType: ClassType.PHYSICAL } }));
  });

  it('enrols a student in themselves and ignores a userId they send', async () => {
    await createEnrollment({ ...physical, userId: '30000000-0000-4000-8000-000000000009' }, student);
    expect(m.userFindFirst).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'student-1' }) }));
  });

  it('asks staff for the student', async () => {
    await expect(createEnrollment({ courseId: COURSE, classType: ClassType.PHYSICAL }, desk)).rejects.toMatchObject({ code: 'USER_ID_REQUIRED', statusCode: 400 });
    expect(m.courseFindFirst).not.toHaveBeenCalled();
  });

  it('refuses a student who does not exist or was deactivated', async () => {
    m.userFindFirst.mockResolvedValue(null);
    await expect(createEnrollment(physical, desk)).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
    expect(m.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: STUDENT, deletedAt: null } }));
  });

  it.each([Role.TEACHER, Role.MARKER, Role.ADMIN, Role.SUPER_ADMIN])('refuses a %s as the target', async (role) => {
    m.userFindFirst.mockResolvedValue({ id: STUDENT, role });
    await expect(createEnrollment(physical, desk)).rejects.toMatchObject({ code: 'NOT_A_STUDENT', statusCode: 400 });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('refuses a class that is missing or closed, before touching enrollments', async () => {
    m.courseFindFirst.mockResolvedValue(null);
    await expect(createEnrollment(physical, desk)).rejects.toMatchObject({ code: 'CLASS_NOT_FOUND', statusCode: 404 });
    expect(m.courseFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: COURSE, isActive: true } }));
    expect(m.calls).toEqual([]);
  });
});

describe('createEnrollment — one active enrollment per class', () => {
  it('refuses a student already enrolled in the same mode', async () => {
    m.unique.mockResolvedValue({ id: 'e1', isActive: true });
    await expect(createEnrollment(physical, desk)).rejects.toMatchObject({ code: 'ALREADY_ENROLLED', statusCode: 409 });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('refuses a student already enrolled in the other mode, so one class does not carry two sets of dues', async () => {
    m.other.mockResolvedValue({ id: 'e2' });
    await expect(createEnrollment(physical, desk)).rejects.toMatchObject({ code: 'ALREADY_ENROLLED_OTHER_MODE', statusCode: 409 });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('looks for an active enrollment of the same class in a different mode, for the same student', async () => {
    await createEnrollment(physical, desk);
    expect(m.other).toHaveBeenCalledWith({ where: { userId: STUDENT, courseId: COURSE, isActive: true, classType: { not: ClassType.PHYSICAL } }, select: { id: true } });
  });

  it('names the same-mode refusal first when both would apply', async () => {
    m.unique.mockResolvedValue({ id: 'e1', isActive: true });
    m.other.mockResolvedValue({ id: 'e2' });
    await expect(createEnrollment(physical, desk)).rejects.toMatchObject({ code: 'ALREADY_ENROLLED' });
  });

  it('applies to a student enrolling themselves too', async () => {
    m.other.mockResolvedValue({ id: 'e2' });
    await expect(createEnrollment(physical, student)).rejects.toMatchObject({ code: 'ALREADY_ENROLLED_OTHER_MODE' });
  });

  it('reactivates a cancelled enrollment in the same mode instead of adding a row', async () => {
    m.unique.mockResolvedValue({ id: 'e-old', isActive: false });
    await expect(createEnrollment(physical, desk)).resolves.toEqual({ id: 'enrollment-old' });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e-old' }, data: { isActive: true } }));
    expect(m.create).not.toHaveBeenCalled();
  });

  it('does not reactivate a cancelled row while the other mode is active', async () => {
    m.unique.mockResolvedValue({ id: 'e-old', isActive: false });
    m.other.mockResolvedValue({ id: 'e2' });
    await expect(createEnrollment(physical, desk)).rejects.toMatchObject({ code: 'ALREADY_ENROLLED_OTHER_MODE' });
    expect(m.update).not.toHaveBeenCalled();
  });
});

describe('createEnrollment — two desks at once', () => {
  it('takes one lock per student and class before reading, so a second request sees the first', async () => {
    await createEnrollment(physical, desk);
    expect(m.calls).toEqual(['lock', 'read-same-mode', 'read-other-mode', 'create']);
    expect(m.lock).toHaveBeenCalledWith(expect.anything(), 'enrollment', 'org-1', `${STUDENT}:${COURSE}`);
  });

  it('falls back to the default organization for a class with none recorded', async () => {
    m.courseFindFirst.mockResolvedValue({ id: COURSE, organizationId: null });
    await createEnrollment(physical, desk);
    expect(m.lock).toHaveBeenCalledWith(expect.anything(), 'enrollment', '00000000-0000-4000-8000-000000000001', `${STUDENT}:${COURSE}`);
  });
});
