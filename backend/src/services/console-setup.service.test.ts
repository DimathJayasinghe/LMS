import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ courseFindMany: vi.fn(), courseCount: vi.fn(), userCount: vi.fn(), clock: vi.fn() }));

vi.mock('@/config/database', () => ({ prisma: { course: { findMany: m.courseFindMany, count: m.courseCount }, user: { count: m.userCount } } }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));

import { getSetupPanel } from './console-setup.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const course = (id: string, name: string, year: number, teacherName = 'Mr Silva') => ({ id, name, year, teacher: { name: teacherName } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-20T06:00:00Z'));
  vi.resetAllMocks();
  m.clock.mockResolvedValue({ organizationId: 'org', timezone: 'Asia/Colombo' });
  m.courseFindMany.mockResolvedValue([]);
  m.courseCount.mockResolvedValue(0);
  m.userCount.mockResolvedValue(0);
});
afterEach(() => vi.useRealTimers());

describe('getSetupPanel', () => {
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before reading anything', async (role) => {
    await expect(getSetupPanel({ userId: 'x', role } as never)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
    expect(m.courseFindMany).not.toHaveBeenCalled();
    expect(m.userCount).not.toHaveBeenCalled();
  });

  it('answers zeros and empty lists on an empty database', async () => {
    await expect(getSetupPanel(owner as never)).resolves.toEqual({
      orphanedClasses: { count: 0, rows: [] }, oldBatches: { count: 0, rows: [] }, studentsWithoutPhone: 0,
    });
  });

  it('lists active classes whose teacher left (deactivated or moved to another role), in this organization', async () => {
    m.courseFindMany.mockResolvedValueOnce([course('c1', 'Physics 2026', 2026, 'Ms Perera')]);
    m.courseCount.mockResolvedValueOnce(4);
    const panel = await getSetupPanel(owner as never);
    const where = { organizationId: 'org', isActive: true, teacher: { OR: [{ deletedAt: { not: null } }, { role: { not: 'TEACHER' } }] } };
    expect(m.courseFindMany.mock.calls[0]![0]).toMatchObject({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 10 });
    expect(m.courseCount).toHaveBeenNthCalledWith(1, { where });
    expect(panel.orphanedClasses).toEqual({ count: 4, rows: [{ courseId: 'c1', name: 'Physics 2026', year: 2026, teacherName: 'Ms Perera' }] });
  });

  it('lists active classes from before this Colombo year as batches to end', async () => {
    m.courseFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([course('c2', 'Chemistry 2025', 2025)]);
    m.courseCount.mockResolvedValueOnce(0).mockResolvedValueOnce(7);
    const panel = await getSetupPanel(owner as never);
    const where = { organizationId: 'org', isActive: true, year: { lt: 2026 } };
    expect(m.courseFindMany.mock.calls[1]![0]).toMatchObject({ where, take: 10 });
    expect(m.courseCount).toHaveBeenNthCalledWith(2, { where });
    expect(panel.oldBatches).toEqual({ count: 7, rows: [{ courseId: 'c2', name: 'Chemistry 2025', year: 2025, teacherName: 'Mr Silva' }] });
  });

  it('takes the year from the Colombo date, so New Year at the start of 1 January is the new year', async () => {
    vi.setSystemTime(new Date('2026-12-31T19:00:00Z')); // 1 January 2027, 00:30 in Colombo
    await getSetupPanel(owner as never);
    expect(m.courseFindMany.mock.calls[1]![0].where.year).toEqual({ lt: 2027 });
  });

  it('counts active students with no phone number, missing or blank', async () => {
    m.userCount.mockResolvedValue(12);
    const panel = await getSetupPanel(owner as never);
    expect(m.userCount).toHaveBeenCalledWith({
      where: { organizationId: 'org', role: Role.STUDENT, deletedAt: null, OR: [{ phone: null }, { phone: '' }] },
    });
    expect(panel.studentsWithoutPhone).toBe(12);
  });
});
