import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamType, SubmissionStatus } from '@prisma/client';

const m = vi.hoisted(() => ({
  db: {
    enrollment: { findFirst: vi.fn() },
    submission: { findUnique: vi.fn(), update: vi.fn() },
  },
  r2HeadObject: vi.fn(),
  clock: vi.fn(),
  readerFor: vi.fn(),
  settings: {} as Record<string, unknown>,
}));
vi.mock('@/config/database', () => ({ prisma: m.db }));
vi.mock('@/utils/r2', () => ({ createR2PresignedPutUrl: vi.fn(), createR2PresignedGetUrl: vi.fn(), r2HeadObject: m.r2HeadObject }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess: vi.fn() }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/services/notification.service', () => ({}));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: m.clock }));
vi.mock('@/services/settings.service', () => ({
  createSettingsReader: (organizationId: string) => { m.readerFor(organizationId); return async (key: string) => m.settings[key]; },
}));
import { completeSubmission } from './submission.service';

const end = new Date('2026-09-06T10:00:00Z');
const at = (seconds: number) => vi.setSystemTime(new Date(end.getTime() + seconds * 1000));
const key = 'answers/exam-1/student-1/answer.pdf';
const unfinished = {
  id: 'submission-1', status: SubmissionStatus.UPLOADING, userId: 'student-1', examId: 'exam-1', answerPdfUrl: null,
  answers: null, writtenAnswers: null, marks: null, feedback: null, gradedAt: null, gradedById: null, source: 'ONLINE',
  submittedAt: new Date('2026-09-06T09:55:00Z'), updatedAt: new Date('2026-09-06T09:55:00Z'),
  exam: { endTime: end, isPublished: false, courseId: 'course-1', deletedAt: null, type: ExamType.WRITTEN },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  m.settings = { 'exams.uploadGraceSeconds': 180 };
  m.clock.mockResolvedValue({ organizationId: 'org-1', timezone: 'Asia/Colombo' });
  m.db.enrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
  m.db.submission.findUnique.mockResolvedValue(unfinished);
  m.db.submission.update.mockResolvedValue({ ...unfinished, status: SubmissionStatus.COMPLETED, answerPdfUrl: key });
  m.r2HeadObject.mockResolvedValue({ exists: true });
});
afterEach(() => vi.useRealTimers());

describe('completing an upload after the exam ends', () => {
  it.each([0, 60, 179, 180])('accepts it %i seconds after the end under the default 180 s grace', async (seconds) => {
    at(seconds);
    await expect(completeSubmission('submission-1', 'student-1', { key })).resolves.toMatchObject({ status: SubmissionStatus.COMPLETED });
  });

  it.each([181, 600])('refuses it %i seconds after the end', async (seconds) => {
    at(seconds);
    await expect(completeSubmission('submission-1', 'student-1', { key })).rejects.toMatchObject({ code: 'EXAM_ENDED', statusCode: 400 });
    expect(m.r2HeadObject).not.toHaveBeenCalled();
    expect(m.db.submission.update).not.toHaveBeenCalled();
  });

  it('follows the owner setting: a 30 s grace refuses at 31 s and accepts at 29 s', async () => {
    m.settings['exams.uploadGraceSeconds'] = 30;
    at(31);
    await expect(completeSubmission('submission-1', 'student-1', { key })).rejects.toMatchObject({ code: 'EXAM_ENDED' });
    at(29);
    await expect(completeSubmission('submission-1', 'student-1', { key })).resolves.toMatchObject({ status: SubmissionStatus.COMPLETED });
  });

  it('allows no grace at all when the owner sets 0', async () => {
    m.settings['exams.uploadGraceSeconds'] = 0;
    at(0);
    await expect(completeSubmission('submission-1', 'student-1', { key })).resolves.toBeDefined();
    at(1);
    await expect(completeSubmission('submission-1', 'student-1', { key })).rejects.toMatchObject({ code: 'EXAM_ENDED' });
  });

  it("reads the setting of the student's own organization", async () => {
    at(10);
    await completeSubmission('submission-1', 'student-1', { key });
    expect(m.clock).toHaveBeenCalledWith('student-1');
    expect(m.readerFor).toHaveBeenCalledWith('org-1');
  });

  it('does not read the setting when the row is already completed', async () => {
    m.db.submission.findUnique.mockResolvedValue({ ...unfinished, status: SubmissionStatus.COMPLETED });
    at(999);
    await completeSubmission('submission-1', 'student-1');
    expect(m.clock).not.toHaveBeenCalled();
  });

  it("refuses another student's row before reading any setting", async () => {
    await expect(completeSubmission('submission-1', 'student-2', { key })).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(m.clock).not.toHaveBeenCalled();
  });
});
