import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamType, SubmissionStatus } from '@prisma/client';

const db = vi.hoisted(() => ({
  exam: { findUnique: vi.fn() }, enrollment: { findFirst: vi.fn() },
  submission: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
const storage = vi.hoisted(() => ({ createR2PresignedPutUrl: vi.fn(), r2HeadObject: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/utils/r2', () => storage);
vi.mock('@/services/class.service', () => ({}));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/services/notification.service', () => ({}));
import { completeSubmission, startSubmission } from './submission.service';

const now = new Date('2026-09-06T09:00:00Z');
const exam = {
  id: 'exam-1', title: 'Paper', type: ExamType.HYBRID, courseId: 'course-1',
  startTime: new Date('2026-09-06T08:00:00Z'), endTime: new Date('2026-09-06T10:00:00Z'),
  totalMarks: 100, isPublished: false, deletedAt: null, allowTypedAnswers: true, allowPdfUpload: true,
  mcqPayload: { questions: [{ id: 'q1', text: '2 + 2?', order: 1, marks: 10,
    options: [{ id: 'a', text: '4', isCorrect: true }, { id: 'b', text: '5', isCorrect: false }] }] },
};
const pdf = { fileName: 'answer.pdf', contentType: 'application/pdf' as const, fileSizeBytes: 100 };
const row = {
  id: 'submission-1', userId: 'student-1', examId: exam.id, status: SubmissionStatus.COMPLETED,
  answerPdfUrl: null, answers: null, writtenAnswers: null, marks: null, feedback: null,
  gradedAt: null, submittedAt: now, updatedAt: now,
};
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  db.exam.findUnique.mockResolvedValue(exam);
  db.enrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
  db.submission.findUnique.mockResolvedValue(null);
  db.submission.create.mockResolvedValue(row);
  storage.createR2PresignedPutUrl.mockResolvedValue('https://upload.example/answer');
});
afterEach(() => vi.useRealTimers());

describe('preserved student answer channels and deadlines', () => {
  it.each([ExamType.WRITTEN, ExamType.HYBRID])('starts a valid %s PDF attempt awaiting confirmation', async (type) => {
    db.exam.findUnique.mockResolvedValue({ ...exam, type });
    db.submission.create.mockResolvedValue({ ...row, status: SubmissionStatus.UPLOADING });
    const result = await startSubmission('student-1', { examId: exam.id, ...pdf,
      ...(type === ExamType.HYBRID ? { answers: { q1: ['a'] } } : {}),
    });
    expect(result).toMatchObject({ uploadUrl: 'https://upload.example/answer',
      uploadKey: 'answers/exam-1/student-1/answer.pdf', submission: { status: 'UPLOADING', marks: null },
    });
    expect(db.submission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'UPLOADING', marks: null, gradedAt: null }),
    }));
  });

  it('completes a hybrid typed attempt without issuing a PDF URL or auto-releasing marks', async () => {
    const result = await startSubmission('student-1', {
      examId: exam.id, answers: { q1: ['a'] }, writtenAnswers: { q2: 'Working' },
    });
    expect(result.submission.status).toBe('COMPLETED');
    expect(storage.createR2PresignedPutUrl).not.toHaveBeenCalled();
    expect(db.submission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ writtenAnswers: { q2: 'Working' }, marks: null }),
    }));
  });

  it.each([
    { settings: { allowTypedAnswers: false }, body: { writtenAnswers: { q2: 'Working' } }, code: 'TYPED_NOT_ALLOWED' },
    { settings: { allowPdfUpload: false }, body: pdf, code: 'PDF_NOT_ALLOWED' },
  ])('rejects a disabled answer channel: $code', async ({ settings, body, code }) => {
    db.exam.findUnique.mockResolvedValue({ ...exam, ...settings });
    await expect(startSubmission('student-1', { examId: exam.id, answers: { q1: ['a'] }, ...body }))
      .rejects.toMatchObject({ code });
    expect(db.submission.create).not.toHaveBeenCalled();
  });

  it('completes a confirmed PDF with unpublished result fields hidden', async () => {
    db.submission.findUnique.mockResolvedValue({ ...row, status: SubmissionStatus.UPLOADING, exam });
    storage.r2HeadObject.mockResolvedValue({ exists: true });
    db.submission.update.mockResolvedValue({ ...row, answerPdfUrl: 'answers/exam-1/student-1/answer.pdf',
      marks: 75, feedback: 'Private grading feedback', gradedAt: now,
    });
    const result = await completeSubmission(row.id, 'student-1', { key: 'answers/exam-1/student-1/answer.pdf' });
    expect(result).toMatchObject({ status: 'COMPLETED', marks: null, feedback: null, gradedAt: null });
    expect(db.submission.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      status: 'COMPLETED', answerPdfUrl: 'answers/exam-1/student-1/answer.pdf',
    } }));
  });

  it.each([
    { time: '2026-09-06T07:59:59Z', code: 'EXAM_NOT_STARTED' },
    { time: '2026-09-06T10:00:01Z', code: 'EXAM_ENDED' },
  ])('enforces server time at $time', async ({ time, code }) => {
    vi.setSystemTime(new Date(time));
    await expect(startSubmission('student-1', { examId: exam.id, answers: { q1: ['a'] }, ...pdf }))
      .rejects.toMatchObject({ code });
    expect(db.submission.create).not.toHaveBeenCalled();
  });
});
