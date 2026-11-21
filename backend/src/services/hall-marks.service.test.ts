import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const m = vi.hoisted(() => ({
  examFind: vi.fn(), userFindMany: vi.fn(), submissionFindMany: vi.fn(), upsert: vi.fn(), queryRaw: vi.fn(),
  assertCourseAccess: vi.fn(), assertMarkerAssigned: vi.fn(), grantedAudiences: vi.fn(),
  lock: vi.fn(), logInTransaction: vi.fn(), transactionOptions: vi.fn(),
  committed: [] as unknown[], settings: {} as Record<string, unknown>,
}));

vi.mock('@/config/database', () => {
  const makeTx = (staged: unknown[]) => ({
    exam: { findUnique: m.examFind },
    user: { findMany: m.userFindMany },
    submission: { findMany: m.submissionFindMany, upsert: (args: unknown) => { staged.push(args); return m.upsert(args); } },
    $queryRaw: m.queryRaw,
  });
  return {
    prisma: {
      exam: { findUnique: m.examFind },
      user: { findMany: m.userFindMany },
      submission: { findMany: m.submissionFindMany },
      // A real transaction keeps nothing when its callback throws; the mock models that so rollback can be asserted.
      $transaction: async (run: (tx: ReturnType<typeof makeTx>) => Promise<unknown>, options: unknown) => {
        m.transactionOptions(options);
        const staged: unknown[] = [];
        const result = await run(makeTx(staged));
        m.committed.push(...staged);
        return result;
      },
    },
  };
});
vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: m.lock }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => m.settings[key] }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess: m.assertCourseAccess }));
vi.mock('@/services/access.service', () => ({
  assertMarkerAssignedToExam: m.assertMarkerAssigned,
  getMarkerGrantedAudienceIds: m.grantedAudiences,
}));
vi.mock('@/services/audit.service', () => ({ logInTransaction: m.logInTransaction }));

import { enterHallMarks } from './hall-marks.service';

const owner = { userId: 'owner', role: Role.SUPER_ADMIN };
const teacher = { userId: 'teacher', role: Role.TEACHER };
const marker = { userId: 'marker', role: Role.MARKER };
const ctx = { actorId: 'x', actorRole: 'x', ip: '10.0.0.1', userAgent: 'test' };

const exam = (over: Record<string, unknown> = {}) => ({
  id: 'exam', courseId: 'course', type: 'INCLASS', totalMarks: 100, isPublished: false, deletedAt: null,
  paperRevisionId: null, organizationId: 'org', ...over,
});
const student = (indexNumber: number, over: Record<string, unknown> = {}) => ({
  id: `u${indexNumber}`, indexNumber, name: `Student ${indexNumber}`, examParticipants: [], ...over,
});
const physical = { audienceId: 'a-phys', audience: { deliveryMode: 'PHYSICAL' } };
const online = { audienceId: 'a-online', audience: { deliveryMode: 'ONLINE' } };
const existing = (userId: string, over: Record<string, unknown> = {}) => ({
  id: `s-${userId}`, userId, source: 'HALL', status: 'COMPLETED', marks: 50, gradedBy: null, ...over,
});

const run = (rows: { indexNumber: number; marks: number }[], dryRun: boolean, actor: { userId: string; role: Role } = teacher) =>
  enterHallMarks('exam', { rows, dryRun }, actor, ctx);

beforeEach(() => {
  vi.resetAllMocks();
  m.committed.length = 0;
  m.settings = { 'exams.hallMarks.maxRowsPerBatch': 500 };
  m.examFind.mockResolvedValue(exam());
  m.userFindMany.mockResolvedValue([student(101), student(102)]);
  m.submissionFindMany.mockResolvedValue([]);
  m.queryRaw.mockResolvedValue([{ isPublished: false, deletedAt: null }]);
  m.upsert.mockResolvedValue({});
  m.assertCourseAccess.mockResolvedValue(undefined);
  m.assertMarkerAssigned.mockResolvedValue(undefined);
  m.grantedAudiences.mockResolvedValue(new Set(['a-phys']));
  m.logInTransaction.mockResolvedValue(undefined);
});

describe('who may enter hall marks', () => {
  it('answers 404 for an unknown exam before any role or ownership check', async () => {
    m.examFind.mockResolvedValue(null);
    await expect(run([{ indexNumber: 101, marks: 5 }], true, { userId: 'a', role: Role.ADMIN })).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND', statusCode: 404 });
    expect(m.assertCourseAccess).not.toHaveBeenCalled();
  });

  it('treats a deleted exam as not found', async () => {
    m.examFind.mockResolvedValue(exam({ deletedAt: new Date() }));
    await expect(run([{ indexNumber: 101, marks: 5 }], true)).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND', statusCode: 404 });
  });

  it.each([Role.ADMIN, Role.STUDENT])('refuses %s even if the route guard is bypassed, before reading any roster', async (role) => {
    await expect(run([{ indexNumber: 101, marks: 5 }], false, { userId: 'a', role })).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.userFindMany).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('refuses a teacher who does not own the course, before reading any roster', async () => {
    m.assertCourseAccess.mockRejectedValue(Object.assign(new Error('x'), { code: 'FORBIDDEN_COURSE', statusCode: 403 }));
    await expect(run([{ indexNumber: 101, marks: 5 }], false)).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
    expect(m.assertCourseAccess).toHaveBeenCalledWith('course', teacher);
    expect(m.userFindMany).not.toHaveBeenCalled();
  });

  it('lets the owner through without a course ownership check', async () => {
    await expect(run([{ indexNumber: 101, marks: 5 }], true, owner)).resolves.toMatchObject({ dryRun: true });
    expect(m.assertCourseAccess).not.toHaveBeenCalled();
  });

  it('refuses a marker who is not assigned to the exam, before reading any roster', async () => {
    m.assertMarkerAssigned.mockRejectedValue(Object.assign(new Error('x'), { code: 'MARKER_NOT_ASSIGNED', statusCode: 403 }));
    await expect(run([{ indexNumber: 101, marks: 5 }], false, marker)).rejects.toMatchObject({ code: 'MARKER_NOT_ASSIGNED', statusCode: 403 });
    expect(m.assertMarkerAssigned).toHaveBeenCalledWith('marker', 'exam');
    expect(m.userFindMany).not.toHaveBeenCalled();
  });
});

describe('check ordering', () => {
  it('refuses a published exam before judging eligibility or rows', async () => {
    m.examFind.mockResolvedValue(exam({ isPublished: true, type: 'MCQ' }));
    await expect(run([{ indexNumber: 101, marks: 5 }], true)).rejects.toMatchObject({ code: 'RESULTS_ALREADY_PUBLISHED', statusCode: 409 });
    expect(m.userFindMany).not.toHaveBeenCalled();
  });

  it.each(['MCQ', 'WRITTEN', 'HYBRID'])('refuses a legacy %s exam: hall entry is for in-class and physical-audience papers', async (type) => {
    m.examFind.mockResolvedValue(exam({ type }));
    await expect(run([{ indexNumber: 101, marks: 5 }], true)).rejects.toMatchObject({ code: 'EXAM_NOT_HALL_ELIGIBLE', statusCode: 400 });
    expect(m.userFindMany).not.toHaveBeenCalled();
  });

  it('accepts a scoped exam of any type', async () => {
    m.examFind.mockResolvedValue(exam({ type: 'WRITTEN', paperRevisionId: 'rev' }));
    m.userFindMany.mockResolvedValue([student(101, { examParticipants: [physical] })]);
    await expect(run([{ indexNumber: 101, marks: 5 }], true)).resolves.toMatchObject({ dryRun: true });
  });

  it('enforces the owner row limit from the settings, before reading any roster', async () => {
    m.settings['exams.hallMarks.maxRowsPerBatch'] = 2;
    const rows = [1, 2, 3].map((indexNumber) => ({ indexNumber, marks: 1 }));
    await expect(run(rows, true)).rejects.toMatchObject({ code: 'TOO_MANY_ROWS', statusCode: 400 });
    expect(m.userFindMany).not.toHaveBeenCalled();
  });

  it('accepts exactly the limit', async () => {
    m.settings['exams.hallMarks.maxRowsPerBatch'] = 2;
    await expect(run([{ indexNumber: 101, marks: 1 }, { indexNumber: 102, marks: 1 }], true)).resolves.toMatchObject({ dryRun: true });
  });
});

describe('per-row results', () => {
  it('looks students up through the exam course roster only (active enrollment, student role, not deactivated)', async () => {
    await run([{ indexNumber: 101, marks: 5 }], true);
    const where = m.userFindMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      indexNumber: { in: [101] }, role: Role.STUDENT, deletedAt: null,
      enrollments: { some: { courseId: 'course', isActive: true } },
    });
  });

  it('reports an index that is not on the course roster', async () => {
    const result = await run([{ indexNumber: 999, marks: 5 }], true);
    expect(result.rows).toEqual([expect.objectContaining({ indexNumber: 999, status: 'UNKNOWN_INDEX' })]);
  });

  it('reports a new mark as WILL_CHANGE from null, and an identical mark as OK', async () => {
    m.submissionFindMany.mockResolvedValue([existing('u102', { marks: 70 })]);
    const result = await run([{ indexNumber: 101, marks: 80 }, { indexNumber: 102, marks: 70 }], true);
    expect(result.rows[0]).toMatchObject({ status: 'WILL_CHANGE', before: null, after: 80 });
    expect(result.rows[1]).toMatchObject({ status: 'OK', before: 70, after: 70 });
    expect(result.counts).toEqual({ total: 2, changed: 1, unchanged: 1, rejected: 0 });
  });

  it('shows the before and after of a changed mark', async () => {
    m.submissionFindMany.mockResolvedValue([existing('u101', { marks: 40 })]);
    const result = await run([{ indexNumber: 101, marks: 45 }], true);
    expect(result.rows[0]).toMatchObject({ status: 'WILL_CHANGE', before: 40, after: 45 });
  });

  it('flags the second and later occurrences of an index, keeping the first', async () => {
    const result = await run([{ indexNumber: 101, marks: 5 }, { indexNumber: 101, marks: 6 }, { indexNumber: 101, marks: 7 }], true);
    expect(result.rows.map((row) => row.status)).toEqual(['WILL_CHANGE', 'DUPLICATE_IN_BATCH', 'DUPLICATE_IN_BATCH']);
  });

  it.each([
    [-1, 'OUT_OF_RANGE'], [101, 'OUT_OF_RANGE'], [12.5, 'OUT_OF_RANGE'], [0, 'WILL_CHANGE'], [100, 'WILL_CHANGE'],
  ])('marks %s out of a total of 100 is %s (whole numbers only: marks are stored as integers)', async (marks, status) => {
    const result = await run([{ indexNumber: 101, marks }], true);
    expect(result.rows[0]!.status).toBe(status);
  });

  it('refuses decimals even when the owner enabled the decimal setting, because the column is an integer', async () => {
    m.settings['exams.hallMarks.allowDecimal'] = true;
    const result = await run([{ indexNumber: 101, marks: 7.5 }], true);
    expect(result.rows[0]!.status).toBe('OUT_OF_RANGE');
  });

  it.each(['COMPLETED', 'UPLOADING'])('refuses a row that already has an online submission (%s)', async (status) => {
    m.submissionFindMany.mockResolvedValue([existing('u101', { source: 'ONLINE', status })]);
    const result = await run([{ indexNumber: 101, marks: 5 }], true);
    expect(result.rows[0]!.status).toBe('ONLINE_SUBMISSION_EXISTS');
  });

  it('keeps one bad row from hiding the others', async () => {
    const result = await run([{ indexNumber: 999, marks: 5 }, { indexNumber: 101, marks: 5 }, { indexNumber: 102, marks: 500 }], true);
    expect(result.rows.map((row) => row.status)).toEqual(['UNKNOWN_INDEX', 'WILL_CHANGE', 'OUT_OF_RANGE']);
    expect(result.counts).toEqual({ total: 3, changed: 1, unchanged: 0, rejected: 2 });
  });

  it('numbers rows by their position in the pasted list', async () => {
    const result = await run([{ indexNumber: 999, marks: 5 }, { indexNumber: 101, marks: 5 }], true);
    expect(result.rows.map((row) => row.line)).toEqual([1, 2]);
  });
});

describe('scoped exams', () => {
  beforeEach(() => {
    m.examFind.mockResolvedValue(exam({ type: 'HYBRID', paperRevisionId: 'rev' }));
  });

  it('accepts a student whose audience is physical', async () => {
    m.userFindMany.mockResolvedValue([student(101, { examParticipants: [physical] })]);
    expect((await run([{ indexNumber: 101, marks: 5 }], true)).rows[0]!.status).toBe('WILL_CHANGE');
  });

  it('refuses a student whose audience is online, or who has no audience', async () => {
    m.userFindMany.mockResolvedValue([student(101, { examParticipants: [online] }), student(102)]);
    const result = await run([{ indexNumber: 101, marks: 5 }, { indexNumber: 102, marks: 5 }], true);
    expect(result.rows.map((row) => row.status)).toEqual(['NOT_ELIGIBLE', 'NOT_ELIGIBLE']);
  });

  it('applies the physical rule to a scoped in-class exam too', async () => {
    m.examFind.mockResolvedValue(exam({ type: 'INCLASS', paperRevisionId: 'rev' }));
    m.userFindMany.mockResolvedValue([student(101, { examParticipants: [online] })]);
    expect((await run([{ indexNumber: 101, marks: 5 }], true)).rows[0]!.status).toBe('NOT_ELIGIBLE');
  });

  it('checks the marker audience grant per row, loading the grants once', async () => {
    m.userFindMany.mockResolvedValue([
      student(101, { examParticipants: [physical] }),
      student(102, { examParticipants: [{ audienceId: 'a-other', audience: { deliveryMode: 'PHYSICAL' } }] }),
    ]);
    const result = await run([{ indexNumber: 101, marks: 5 }, { indexNumber: 102, marks: 5 }], true, marker);
    expect(result.rows.map((row) => row.status)).toEqual(['WILL_CHANGE', 'NOT_ASSIGNED']);
    expect(m.grantedAudiences).toHaveBeenCalledTimes(1);
    expect(m.grantedAudiences).toHaveBeenCalledWith('marker', 'exam');
  });

  it('does not load audience grants for a teacher or the owner', async () => {
    m.userFindMany.mockResolvedValue([student(101, { examParticipants: [physical] })]);
    await run([{ indexNumber: 101, marks: 5 }], true, teacher);
    await run([{ indexNumber: 101, marks: 5 }], true, owner);
    expect(m.grantedAudiences).not.toHaveBeenCalled();
  });

  it('does not check audience grants for a marker on a legacy exam (the whole-exam assignment covers it)', async () => {
    m.examFind.mockResolvedValue(exam());
    await run([{ indexNumber: 101, marks: 5 }], true, marker);
    expect(m.grantedAudiences).not.toHaveBeenCalled();
  });
});

describe('who may overwrite whose marks', () => {
  const setBy = (role: Role | null) => existing('u101', { marks: 40, gradedBy: role ? { role } : null });

  it.each([Role.TEACHER, Role.SUPER_ADMIN])('stops a marker overwriting marks set by a %s', async (role) => {
    m.submissionFindMany.mockResolvedValue([setBy(role)]);
    expect((await run([{ indexNumber: 101, marks: 45 }], true, marker)).rows[0]!.status).toBe('MARKS_SET_BY_TEACHER');
  });

  it('lets a marker repeat the same value without a write', async () => {
    m.submissionFindMany.mockResolvedValue([setBy(Role.TEACHER)]);
    expect((await run([{ indexNumber: 101, marks: 40 }], true, marker)).rows[0]!.status).toBe('OK');
  });

  it.each([null, Role.MARKER])('lets a marker overwrite marks set by %s', async (role) => {
    m.submissionFindMany.mockResolvedValue([setBy(role)]);
    expect((await run([{ indexNumber: 101, marks: 45 }], true, marker)).rows[0]!.status).toBe('WILL_CHANGE');
  });

  it.each([teacher, owner])('lets a $role overwrite marker or teacher marks', async (actor) => {
    m.submissionFindMany.mockResolvedValue([setBy(Role.MARKER)]);
    expect((await run([{ indexNumber: 101, marks: 45 }], true, actor)).rows[0]!.status).toBe('WILL_CHANGE');
  });

  it('reads the grader role for every existing submission', async () => {
    await run([{ indexNumber: 101, marks: 5 }], true);
    expect(m.submissionFindMany.mock.calls[0]![0].select).toMatchObject({ gradedBy: { select: { role: true } } });
    expect(m.submissionFindMany.mock.calls[0]![0].where).toMatchObject({ examId: 'exam' });
  });
});

describe('names', () => {
  it('shows student names to the teacher and the owner', async () => {
    expect((await run([{ indexNumber: 101, marks: 5 }], true, teacher)).rows[0]).toMatchObject({ name: 'Student 101' });
    expect((await run([{ indexNumber: 101, marks: 5 }], true, owner)).rows[0]).toMatchObject({ name: 'Student 101' });
  });

  it('never shows a name to a marker, in a row or anywhere in the result', async () => {
    const result = await run([{ indexNumber: 101, marks: 5 }], true, marker);
    expect(JSON.stringify(result)).not.toContain('Student 101');
    expect(result.rows[0]).not.toHaveProperty('name');
  });

  it('does not even select the name for a marker', async () => {
    await run([{ indexNumber: 101, marks: 5 }], true, marker);
    expect(m.userFindMany.mock.calls[0]![0].select.name).toBeUndefined();
  });
});

describe('dry run', () => {
  it('writes nothing: no transaction, no lock, no submission, no audit', async () => {
    await run([{ indexNumber: 101, marks: 5 }], true);
    expect(m.transactionOptions).not.toHaveBeenCalled();
    expect(m.lock).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.logInTransaction).not.toHaveBeenCalled();
  });

  it('reports applied as false', async () => {
    expect(await run([{ indexNumber: 101, marks: 5 }], true)).toMatchObject({ dryRun: true, applied: false });
  });
});

describe('applying', () => {
  it('writes one completed hall submission per changed row with no answers, and skips unchanged rows', async () => {
    m.submissionFindMany.mockResolvedValue([existing('u102', { marks: 70 })]);
    const result = await run([{ indexNumber: 101, marks: 80 }, { indexNumber: 102, marks: 70 }], false);
    expect(result).toMatchObject({ dryRun: false, applied: true, counts: { total: 2, changed: 1, unchanged: 1, rejected: 0 } });
    expect(m.upsert).toHaveBeenCalledTimes(1);
    const args = m.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ userId_examId: { userId: 'u101', examId: 'exam' } });
    expect(args.create).toMatchObject({ userId: 'u101', examId: 'exam', status: 'COMPLETED', source: 'HALL', marks: 80, gradedById: 'teacher', organizationId: 'org' });
    expect(args.create.gradedAt).toBeInstanceOf(Date);
    expect(args.update).toMatchObject({ marks: 80, gradedById: 'teacher' });
    expect(args.create).not.toHaveProperty('answers');
    expect(args.create).not.toHaveProperty('writtenAnswers');
    expect(args.update).not.toHaveProperty('source');
  });

  it('takes the per-exam lock inside a serializable transaction with room for a large batch', async () => {
    await run([{ indexNumber: 101, marks: 5 }], false);
    expect(m.lock).toHaveBeenCalledWith(expect.anything(), 'hall-marks', 'org', 'exam');
    const options = m.transactionOptions.mock.calls[0]![0];
    expect(options.isolationLevel).toBe('Serializable');
    expect(options.timeout).toBeGreaterThanOrEqual(30000);
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.userFindMany.mock.invocationCallOrder[0]!);
  });

  it('classifies the rows again inside the transaction and holds the exam row so a publish waits', async () => {
    await run([{ indexNumber: 101, marks: 5 }], false);
    expect(m.userFindMany).toHaveBeenCalledTimes(1);
    expect(m.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('records one audit row in the transaction: counts and changed index numbers with before and after, no names', async () => {
    m.submissionFindMany.mockResolvedValue([existing('u101', { marks: 40 })]);
    await run([{ indexNumber: 101, marks: 45 }, { indexNumber: 102, marks: 60 }], false);
    expect(m.logInTransaction).toHaveBeenCalledTimes(1);
    const [, input] = m.logInTransaction.mock.calls[0]!;
    expect(input).toMatchObject({
      action: 'HALL_MARKS_ENTERED', targetType: 'Exam', targetId: 'exam', organizationId: 'org', context: ctx,
      metadata: {
        total: 2, changed: 2, unchanged: 0,
        changes: [{ indexNumber: 101, before: 40, after: 45 }, { indexNumber: 102, before: null, after: 60 }],
      },
    });
    expect(JSON.stringify(input)).not.toContain('Student');
  });

  it('writes no audit row and no submission when nothing changed, so a rerun with the same data is a no-op', async () => {
    m.submissionFindMany.mockResolvedValue([existing('u101', { marks: 5 })]);
    const result = await run([{ indexNumber: 101, marks: 5 }], false);
    expect(result).toMatchObject({ applied: true, counts: { changed: 0, unchanged: 1 } });
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.logInTransaction).not.toHaveBeenCalled();
  });

  it('applies all rows or none: one bad row writes nothing and is reported', async () => {
    const result = await run([{ indexNumber: 101, marks: 5 }, { indexNumber: 999, marks: 5 }], false);
    expect(result).toMatchObject({ dryRun: false, applied: false, counts: { changed: 1, rejected: 1 } });
    expect(result.rows.map((row) => row.status)).toEqual(['WILL_CHANGE', 'UNKNOWN_INDEX']);
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.logInTransaction).not.toHaveBeenCalled();
    expect(m.committed).toEqual([]);
  });

  it('rolls back every row when the audit write fails', async () => {
    m.logInTransaction.mockRejectedValue(new Error('audit down'));
    await expect(run([{ indexNumber: 101, marks: 5 }, { indexNumber: 102, marks: 6 }], false)).rejects.toThrow('audit down');
    expect(m.upsert).toHaveBeenCalledTimes(2);
    expect(m.committed).toEqual([]);
  });

  it('commits the rows when everything succeeds', async () => {
    await run([{ indexNumber: 101, marks: 5 }, { indexNumber: 102, marks: 6 }], false);
    expect(m.committed).toHaveLength(2);
  });

  it('refuses when the results were published after the dry run (exam row read under lock)', async () => {
    m.queryRaw.mockResolvedValue([{ isPublished: true, deletedAt: null }]);
    await expect(run([{ indexNumber: 101, marks: 5 }], false)).rejects.toMatchObject({ code: 'RESULTS_ALREADY_PUBLISHED', statusCode: 409 });
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it('refuses when the exam was deleted after the first read', async () => {
    m.queryRaw.mockResolvedValue([{ isPublished: false, deletedAt: new Date() }]);
    await expect(run([{ indexNumber: 101, marks: 5 }], false)).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND', statusCode: 404 });
  });

  it('turns a serialization failure into a retryable conflict, not a 500', async () => {
    m.upsert.mockRejectedValue(Object.assign(new Error('write conflict'), { code: 'P2034' }));
    await expect(run([{ indexNumber: 101, marks: 5 }], false)).rejects.toMatchObject({ code: 'HALL_MARKS_CONFLICT', statusCode: 409 });
  });

  it('lets any other database error through unchanged', async () => {
    m.upsert.mockRejectedValue(new Error('boom'));
    await expect(run([{ indexNumber: 101, marks: 5 }], false)).rejects.toThrow('boom');
  });

  it('a marker apply carries the marker as grader and respects the overwrite rule inside the transaction', async () => {
    m.submissionFindMany.mockResolvedValue([existing('u101', { marks: 40, gradedBy: { role: Role.TEACHER } })]);
    const result = await run([{ indexNumber: 101, marks: 45 }], false, marker);
    expect(result).toMatchObject({ applied: false, counts: { rejected: 1 } });
    expect(m.upsert).not.toHaveBeenCalled();
  });
});
