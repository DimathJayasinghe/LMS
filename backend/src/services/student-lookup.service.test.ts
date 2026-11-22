import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({ findMany: vi.fn(), org: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: { user: { findMany: m.findMany } } }));
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

  it('also matches an index number written as digits', async () => {
    await lookupStudents(desk, { q: '4021' });
    expect(whereOf().OR).toContainEqual({ indexNumber: 4021 });
  });

  it('does not ask for an index number too large for the column', async () => {
    await lookupStudents(desk, { q: '12345678901' });
    expect(whereOf().OR).not.toContainEqual(expect.objectContaining({ indexNumber: expect.anything() }));
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
