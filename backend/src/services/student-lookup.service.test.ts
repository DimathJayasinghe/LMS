import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), org: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: { user: { findMany: m.findMany, findFirst: m.findFirst } } }));
vi.mock('@/services/settings.service', () => ({ organizationForUser: m.org }));

import { lookupStudents } from './student-lookup.service';

const desk = { userId: 'desk-1', role: Role.ADMIN };
const owner = { userId: 'owner-1', role: Role.SUPER_ADMIN };
const row = { id: 's1', name: 'Nimal Perera', indexNumber: 4021, profileImage: null };
const whereOf = () => m.findMany.mock.calls[0]![0].where as { OR: unknown[] } & Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  m.org.mockResolvedValue('org-1');
  m.findMany.mockResolvedValue([row]);
  m.findFirst.mockResolvedValue(null);
});

describe('lookupStudents — who may look', () => {
  it.each([[desk], [owner]])('lets %j search', async (actor) => {
    await expect(lookupStudents(actor, { q: 'nimal' })).resolves.toEqual([row]);
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s before any query', async (role) => {
    await expect(lookupStudents({ userId: 'u', role }, { q: 'nimal' })).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.org).not.toHaveBeenCalled();
    expect(m.findMany).not.toHaveBeenCalled();
  });
});

describe('lookupStudents — what it can find', () => {
  it('only finds active students of the caller organization', async () => {
    await lookupStudents(desk, { q: 'nimal' });
    expect(whereOf()).toMatchObject({ organizationId: 'org-1', role: Role.STUDENT, deletedAt: null });
    expect(m.org).toHaveBeenCalledWith('desk-1');
  });

  it('matches a name in any case', async () => {
    await lookupStudents(desk, { q: 'nimal' });
    expect(whereOf().OR).toEqual([{ name: { contains: 'nimal', mode: 'insensitive' } }]);
  });

  it('looks for the index number first when the text is digits, in the same organization', async () => {
    await lookupStudents(desk, { q: '4021' });
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', role: Role.STUDENT, deletedAt: null, indexNumber: 4021 },
    }));
    expect(m.findFirst.mock.calls[0]![0].select).toEqual({ id: true, name: true, indexNumber: true, profileImage: true });
  });

  it('does not look for an index number in a name or in digits too large for the column', async () => {
    await lookupStudents(desk, { q: 'nimal' });
    await lookupStudents(desk, { q: '12345678901' });
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it('puts the exact index match first and leaves room for seven others, even when phones contain the digits', async () => {
    const exact = { id: 'exact', name: 'Zed Last', indexNumber: 123, profileImage: null };
    const phoneHits = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `Aaa ${i}`, indexNumber: 9000 + i, profileImage: null }));
    m.findFirst.mockResolvedValue(exact);
    m.findMany.mockResolvedValue(phoneHits);

    const found = await lookupStudents(desk, { q: '123' });

    expect(found[0]).toEqual(exact);
    expect(found).toHaveLength(8);
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 7 }));
    expect(whereOf()).toMatchObject({ id: { not: 'exact' } });
  });

  it('asks for all eight when no student has that index number', async () => {
    await lookupStudents(desk, { q: '123' });
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 8 }));
    expect(whereOf()).not.toHaveProperty('id');
  });

  it('matches a phone number without spaces or dashes, only when it looks like one', async () => {
    await lookupStudents(desk, { q: '077 123-4567' });
    expect(whereOf().OR).toContainEqual({ phone: { contains: '0771234567' } });
    m.findMany.mockClear();
    await lookupStudents(desk, { q: 'nimal' });
    expect(whereOf().OR).not.toContainEqual(expect.objectContaining({ phone: expect.anything() }));
  });
});

describe('lookupStudents — what it gives back', () => {
  it('selects only the fields the desk needs, never contact details or identity numbers', async () => {
    await lookupStudents(desk, { q: 'nimal' });
    expect(m.findMany.mock.calls[0]![0].select).toEqual({ id: true, name: true, indexNumber: true, profileImage: true });
  });

  it('returns at most eight students in name order', async () => {
    await lookupStudents(desk, { q: 'nimal' });
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 8, orderBy: [{ name: 'asc' }, { indexNumber: 'asc' }] }));
  });
});
