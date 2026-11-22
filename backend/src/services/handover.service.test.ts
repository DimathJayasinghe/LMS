import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  listDependencies: vi.fn(),
  reassign: vi.fn(),
  userFindMany: vi.fn(),
  slotFindMany: vi.fn(),
}));

vi.mock('@/config/database', () => ({ prisma: {} }));
vi.mock('@/services/handover-dependencies.service', () => ({ listHandoverDependencies: m.listDependencies }));
vi.mock('@/services/class.service', () => ({ reassignCourseTeacher: m.reassign }));

import { applyHandover } from './handover.service';

const tx = { user: { findMany: m.userFindMany }, timetableSlot: { findMany: m.slotFindMany } } as never;
const leaver = { id: 'leaver', organizationId: 'org-1' };
const OPTIONS = { lookaheadDays: 14, now: new Date('2026-11-22T10:00:00Z'), required: true, refuseOpenMarking: true };
const course = (id: string) => ({ id, name: `Course ${id}`, year: 2026, subjectName: 'Physics', isActive: true, upcomingSessions: 1, openExams: 0 });

const run = (request: Parameters<typeof applyHandover>[2], options = OPTIONS) => applyHandover(tx, leaver, request, options);
const refusal = async (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error as { code: string; statusCode: number; details?: unknown });

beforeEach(() => {
  vi.clearAllMocks();
  m.listDependencies.mockResolvedValue({ courses: [], markerAllocations: [] });
  m.userFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ({ id }))));
  m.slotFindMany.mockResolvedValue([]);
  m.reassign.mockResolvedValue(undefined);
});

describe('applyHandover — nothing to hand over', () => {
  it('does nothing for an account that owns no running class and marks nothing', async () => {
    expect(await run({})).toEqual([]);
    expect(m.reassign).not.toHaveBeenCalled();
  });

  it('looks forward by the configured days from the given time', async () => {
    await run({});
    expect(m.listDependencies).toHaveBeenCalledWith(tx, 'leaver', { lookaheadDays: 14, now: OPTIONS.now });
  });
});

describe('applyHandover — refusing with the list', () => {
  it('refuses with 409 TEACHER_HAS_CLASSES and the structured list when no hand-over is given', async () => {
    const deps = { courses: [course('a'), course('b')], markerAllocations: [] };
    m.listDependencies.mockResolvedValue(deps);

    const error = await refusal(run({}));

    expect(error).toMatchObject({ code: 'TEACHER_HAS_CLASSES', statusCode: 409, details: deps });
    expect(m.reassign).not.toHaveBeenCalled();
  });

  it('refuses when the hand-over leaves one class without a new teacher', async () => {
    m.listDependencies.mockResolvedValue({ courses: [course('a'), course('b')], markerAllocations: [] });

    const error = await refusal(run({ handover: [{ courseId: 'a', toTeacherId: 't2' }] }));

    expect(error).toMatchObject({ code: 'TEACHER_HAS_CLASSES', statusCode: 409 });
    expect(m.reassign).not.toHaveBeenCalled();
  });

  it('refuses a marker with open marking, with the list, and moves nothing', async () => {
    const deps = { courses: [], markerAllocations: [{ examId: 'e1', examTitle: 'Term test', courseName: 'Physics' }] };
    m.listDependencies.mockResolvedValue(deps);

    expect(await refusal(run({}))).toMatchObject({ code: 'MARKER_HAS_ALLOCATIONS', statusCode: 409, details: deps });
  });

  it('does not refuse on marking when told the check belongs to someone else (hand-over of an orphan)', async () => {
    m.listDependencies.mockResolvedValue({ courses: [], markerAllocations: [{ examId: 'e1', examTitle: 'T', courseName: 'P' }] });
    expect(await run({}, { ...OPTIONS, refuseOpenMarking: false })).toEqual([]);
  });

  it('lets the owner skip the whole guard when the organization setting says hand-over is not required', async () => {
    m.listDependencies.mockResolvedValue({ courses: [course('a')], markerAllocations: [{ examId: 'e1', examTitle: 'T', courseName: 'P' }] });
    expect(await run({}, { ...OPTIONS, required: false })).toEqual([]);
    expect(m.reassign).not.toHaveBeenCalled();
  });
});

describe('applyHandover — applying', () => {
  beforeEach(() => m.listDependencies.mockResolvedValue({ courses: [course('a'), course('b')], markerAllocations: [] }));

  it('moves every class to the one teacher named in handoverAllTo', async () => {
    const moves = await run({ handoverAllTo: 't2' });

    expect(moves).toEqual([
      { courseId: 'a', courseName: 'Course a', toTeacherId: 't2' },
      { courseId: 'b', courseName: 'Course b', toTeacherId: 't2' },
    ]);
    expect(m.reassign).toHaveBeenCalledWith(tx, 'a', 't2');
    expect(m.reassign).toHaveBeenCalledWith(tx, 'b', 't2');
  });

  it('lets an explicit entry override handoverAllTo for that class', async () => {
    const moves = await run({ handoverAllTo: 't2', handover: [{ courseId: 'b', toTeacherId: 't3' }] });

    expect(moves.map((move) => [move.courseId, move.toTeacherId])).toEqual([['a', 't2'], ['b', 't3']]);
  });

  it('accepts a per-class list that covers every class', async () => {
    const moves = await run({ handover: [{ courseId: 'a', toTeacherId: 't2' }, { courseId: 'b', toTeacherId: 't3' }] });
    expect(moves).toHaveLength(2);
  });

  it('refuses a class the leaver does not own and changes nothing', async () => {
    const error = await refusal(run({ handoverAllTo: 't2', handover: [{ courseId: 'not-theirs', toTeacherId: 't2' }] }));

    expect(error).toMatchObject({ code: 'HANDOVER_COURSE_NOT_OWNED', statusCode: 400 });
    expect(m.reassign).not.toHaveBeenCalled();
  });
});

describe('applyHandover — who may receive', () => {
  beforeEach(() => m.listDependencies.mockResolvedValue({ courses: [course('a')], markerAllocations: [] }));

  it.each(['inactive, a student or in another organization', 'a marker'])('refuses a target that is not an active teacher of this organization (%s)', async () => {
    m.userFindMany.mockResolvedValue([]);

    expect(await refusal(run({ handoverAllTo: 'not-a-teacher' }))).toMatchObject({ code: 'INVALID_HANDOVER_TARGET', statusCode: 400 });
    expect(m.reassign).not.toHaveBeenCalled();
  });

  it('asks only for active teachers of the leaver\'s organization', async () => {
    await run({ handoverAllTo: 't2' });

    expect(m.userFindMany.mock.calls[0]![0].where).toMatchObject({ id: { in: ['t2'] }, role: 'TEACHER', deletedAt: null, organizationId: 'org-1' });
  });

  it('refuses to hand a class back to the person leaving', async () => {
    expect(await refusal(run({ handoverAllTo: 'leaver' }))).toMatchObject({ code: 'INVALID_HANDOVER_TARGET', statusCode: 400 });
    expect(m.reassign).not.toHaveBeenCalled();
  });
});

describe('applyHandover — timetable clashes', () => {
  beforeEach(() => m.listDependencies.mockResolvedValue({ courses: [course('a')], markerAllocations: [] }));

  const slot = (courseId: string, startTime: string, teacherId?: string) => ({
    id: `${courseId}-${startTime}`, courseId, dayOfWeek: 1, startTime, durationMinutes: 60,
    course: { name: `Course ${courseId}`, ...(teacherId ? { teacherId } : {}) },
  });

  it('lists the clashes with a 409 and changes nothing', async () => {
    m.slotFindMany
      .mockResolvedValueOnce([slot('a', '16:00')])
      .mockResolvedValueOnce([slot('x', '16:30', 't2')]);

    const error = await refusal(run({ handoverAllTo: 't2' }));

    expect(error).toMatchObject({ code: 'HANDOVER_SLOT_CONFLICT', statusCode: 409 });
    expect((error as { details: { conflicts: unknown[] } }).details.conflicts).toHaveLength(1);
    expect(m.reassign).not.toHaveBeenCalled();
  });

  it('goes ahead when the new teacher is free', async () => {
    m.slotFindMany
      .mockResolvedValueOnce([slot('a', '16:00')])
      .mockResolvedValueOnce([slot('x', '18:00', 't2')]);

    expect(await run({ handoverAllTo: 't2' })).toHaveLength(1);
  });

  it('reads only active timetable slots', async () => {
    await run({ handoverAllTo: 't2' });

    expect(m.slotFindMany.mock.calls[0]![0].where).toMatchObject({ isActive: true, courseId: { in: ['a'] } });
    expect(m.slotFindMany.mock.calls[1]![0].where).toMatchObject({ isActive: true, course: { teacherId: { in: ['t2'] }, id: { notIn: ['a'] } } });
  });
});
