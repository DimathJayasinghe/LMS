import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const m = vi.hoisted(() => ({
  findMany: vi.fn(), findUnique: vi.fn(), participantFindUnique: vi.fn(),
  assertStudentContentAccess: vi.fn(), assertMarkerAssignedToExam: vi.fn(), assertCourseAccess: vi.fn(), presign: vi.fn(),
  clock: vi.fn(), readerFor: vi.fn(), settings: {} as Record<string, unknown>,
}));
vi.mock('@/config/database', () => ({
  prisma: { exam: { findMany: m.findMany, findUnique: m.findUnique }, examParticipant: { findUnique: m.participantFindUnique } },
}));
vi.mock('@/services/access.service', () => ({ assertStudentContentAccess: m.assertStudentContentAccess, assertMarkerAssignedToExam: m.assertMarkerAssignedToExam }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess: m.assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));
vi.mock('@/services/settings.service', () => ({
  createSettingsReader: (organizationId: string) => { m.readerFor(organizationId); return async (key: string) => m.settings[key]; },
}));
vi.mock('@/utils/r2', () => ({ createR2PresignedGetUrl: m.presign, createR2PresignedPutUrl: vi.fn(), r2HeadObject: vi.fn() }));

import { getExamById, listExams } from './exam.service';

const student = { userId: 'student-1', role: Role.STUDENT };
const all = { status: 'all' as const };
const mcq = { questions: [{ id: 'q1', text: 'Two plus two?', order: 1, marks: 5, options: [{ id: 'a', text: '4', isCorrect: true }, { id: 'b', text: '5', isCorrect: false }] }] };
const base = {
  id: 'exam-1', title: 'Paper', type: 'HYBRID', startTime: new Date('2026-09-06T08:00:00Z'), endTime: new Date('2026-09-06T10:00:00Z'),
  totalMarks: 100, isPublished: false, allowTypedAnswers: true, allowPdfUpload: true, courseId: 'course-1', deletedAt: null,
  createdAt: new Date(), updatedAt: new Date(), paperRevisionId: null, paperPdfUrl: 'papers/exam-1.pdf', mcqPayload: mcq,
};
const scoped = { ...base, paperRevisionId: 'revision-1' };
const audience = (deliveryMode: 'ONLINE' | 'PHYSICAL', name: string | null = null) =>
  ({ audience: { id: 'aud-1', label: 'Group', deliveryMode, institute: name ? { name } : null } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T09:00:00Z'));
  m.assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
  m.presign.mockResolvedValue('https://signed.example/paper.pdf');
  m.findUnique.mockResolvedValue(scoped);
  m.participantFindUnique.mockResolvedValue(audience('ONLINE'));
  m.clock.mockResolvedValue({ organizationId: 'org-1', timezone: 'Asia/Colombo' });
  m.settings = { 'exams.autoSubmitLeadSeconds': 15 };
});

describe('listExams for a student', () => {
  const listed = (over: Record<string, unknown>, participants: unknown[] = []) => ({ ...base, ...over, participants });

  it('only lists scoped exams the student is on the roster of, besides legacy exams', async () => {
    m.findMany.mockResolvedValue([]);
    await listExams(all, student);
    const { where } = m.findMany.mock.calls[0]![0];
    expect(where.OR).toEqual([{ paperRevisionId: null }, { participants: { some: { userId: 'student-1' } } }]);
    expect(where.course).toEqual({ enrollments: { some: { userId: 'student-1', isActive: true } } });
  });

  it('reads only the asking student own participant row', async () => {
    m.findMany.mockResolvedValue([]);
    await listExams(all, student);
    expect(m.findMany.mock.calls[0]![0].select.participants).toMatchObject({ where: { userId: 'student-1' }, take: 1 });
  });

  it('marks each row with myAudience and never leaks the participant rows', async () => {
    m.findMany.mockResolvedValue([
      listed({ id: 'legacy' }),
      listed({ id: 'online', paperRevisionId: 'r' }, [audience('ONLINE')]),
      listed({ id: 'hall', paperRevisionId: 'r' }, [audience('PHYSICAL', 'Nugegoda Centre')]),
    ]);
    const rows = await listExams(all, student);
    expect(rows.map((r) => r.myAudience)).toEqual([
      null,
      { label: 'Group', deliveryMode: 'ONLINE', instituteName: null },
      { label: 'Group', deliveryMode: 'PHYSICAL', instituteName: 'Nugegoda Centre' },
    ]);
    expect(rows.every((r) => !('participants' in r))).toBe(true);
  });

  it.each([Role.TEACHER, Role.SUPER_ADMIN, Role.MARKER])('leaves the %s list unscoped and without myAudience', async (role) => {
    m.findMany.mockResolvedValue([base]);
    const rows = await listExams(all, { userId: 'staff-1', role });
    const args = m.findMany.mock.calls[0]![0];
    expect(args.where.OR).toBeUndefined();
    expect(args.select.participants).toBeUndefined();
    expect(rows[0]).not.toHaveProperty('myAudience');
  });

  it('still refuses the front desk', async () => {
    await expect(listExams(all, { userId: 'desk', role: Role.ADMIN })).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.findMany).not.toHaveBeenCalled();
  });
});

describe('getExamById for a student', () => {
  it('hides a scoped exam from a student who is not on the roster, with a plain 404 and no paper', async () => {
    m.participantFindUnique.mockResolvedValue(null);
    await expect(getExamById('exam-1', student)).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND', statusCode: 404 });
    expect(m.presign).not.toHaveBeenCalled();
  });

  it('answers NOT_ENROLLED before it looks at the roster', async () => {
    m.assertStudentContentAccess.mockRejectedValue(new AppError('NOT_ENROLLED', 403, 'You are not enrolled in this course.'));
    await expect(getExamById('exam-1', student)).rejects.toMatchObject({ code: 'NOT_ENROLLED', statusCode: 403 });
    expect(m.participantFindUnique).not.toHaveBeenCalled();
  });

  it('answers a deleted exam with 404 before the roster', async () => {
    m.findUnique.mockResolvedValue({ ...scoped, deletedAt: new Date() });
    await expect(getExamById('exam-1', student)).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND', statusCode: 404 });
    expect(m.participantFindUnique).not.toHaveBeenCalled();
  });

  it('gives an online participant the paper and the answer-stripped questions, with myAudience', async () => {
    const exam = await getExamById('exam-1', student);
    expect(exam.myAudience).toEqual({ label: 'Group', deliveryMode: 'ONLINE', instituteName: null });
    expect(exam.paperPdfUrl).toBe('https://signed.example/paper.pdf');
    expect(JSON.stringify(exam.mcqPayload)).not.toContain('isCorrect');
    expect(exam.mcqPayload).not.toBeNull();
  });

  it('shows a hall participant where the paper is sat but releases no paper and no questions', async () => {
    m.participantFindUnique.mockResolvedValue(audience('PHYSICAL', 'Nugegoda Centre'));
    const exam = await getExamById('exam-1', student);
    expect(exam.myAudience).toEqual({ label: 'Group', deliveryMode: 'PHYSICAL', instituteName: 'Nugegoda Centre' });
    expect(exam.paperPdfUrl).toBeNull();
    expect(exam.mcqPayload).toBeNull();
    expect(m.presign).not.toHaveBeenCalled();
  });

  it('keeps a legacy exam as it was: no roster lookup, myAudience null', async () => {
    m.findUnique.mockResolvedValue(base);
    const exam = await getExamById('exam-1', student);
    expect(m.participantFindUnique).not.toHaveBeenCalled();
    expect(exam.myAudience).toBeNull();
    expect(exam.paperPdfUrl).toBe('https://signed.example/paper.pdf');
  });

  it('still withholds the paper outside the window for an online participant', async () => {
    vi.setSystemTime(new Date('2026-09-06T07:00:00Z'));
    const exam = await getExamById('exam-1', student);
    expect(exam.paperPdfUrl).toBeNull();
    expect(exam.mcqPayload).toBeNull();
  });
});

describe('getExamById for staff is unchanged', () => {
  it.each([Role.TEACHER, Role.SUPER_ADMIN])('does not look up a roster row or add myAudience for %s', async (role) => {
    const exam = await getExamById('exam-1', { userId: 'staff-1', role });
    expect(m.participantFindUnique).not.toHaveBeenCalled();
    expect(exam).not.toHaveProperty('myAudience');
  });

  it("answers a teacher of another course with the course error, not a roster result", async () => {
    m.assertCourseAccess.mockRejectedValue(new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.'));
    await expect(getExamById('exam-1', { userId: 'teacher-2', role: Role.TEACHER })).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE' });
    expect(m.participantFindUnique).not.toHaveBeenCalled();
  });
});

describe('getExamById tells a student how early the browser submits', () => {
  it('returns the owner setting as sitting.autoSubmitLeadSeconds', async () => {
    m.settings['exams.autoSubmitLeadSeconds'] = 40;
    const exam = await getExamById('exam-1', student);
    expect(exam.sitting).toEqual({ autoSubmitLeadSeconds: 40 });
  });

  it("reads the setting of the student's own organization", async () => {
    await getExamById('exam-1', student);
    expect(m.clock).toHaveBeenCalledWith('student-1');
    expect(m.readerFor).toHaveBeenCalledWith('org-1');
  });

  it('is also returned for a legacy exam', async () => {
    m.findUnique.mockResolvedValue(base);
    const exam = await getExamById('exam-1', student);
    expect(exam.sitting).toEqual({ autoSubmitLeadSeconds: 15 });
  });

  it.each([Role.TEACHER, Role.SUPER_ADMIN])('is not returned to %s and costs them no setting read', async (role) => {
    const exam = await getExamById('exam-1', { userId: 'staff-1', role });
    expect(exam).not.toHaveProperty('sitting');
    expect(m.clock).not.toHaveBeenCalled();
  });

  it('is not read for a student who is refused', async () => {
    m.participantFindUnique.mockResolvedValue(null);
    await expect(getExamById('exam-1', student)).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
    expect(m.clock).not.toHaveBeenCalled();
  });
});
