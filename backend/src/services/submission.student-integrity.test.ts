import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamType, SubmissionStatus } from '@prisma/client';

const db = vi.hoisted(() => ({
  exam: { findUnique: vi.fn() },
  enrollment: { findFirst: vi.fn() },
  submission: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
const storage = vi.hoisted(() => ({
  createR2PresignedPutUrl: vi.fn(), createR2PresignedGetUrl: vi.fn(), r2HeadObject: vi.fn(),
}));
vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/utils/r2', () => storage);
vi.mock('@/services/class.service', () => ({ assertCourseAccess: vi.fn() }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/services/notification.service', () => ({}));
import { completeSubmission, startSubmission } from './submission.service';

const exam = {
  id: 'exam-1', title: 'Paper', type: ExamType.WRITTEN, courseId: 'course-1',
  startTime: new Date('2026-09-06T08:00:00Z'), endTime: new Date('2026-09-06T10:00:00Z'),
  totalMarks: 100, isPublished: false, deletedAt: null, mcqPayload: null,
  allowTypedAnswers: true, allowPdfUpload: true,
};
const submission = {
  id: 'submission-1', status: SubmissionStatus.COMPLETED, userId: 'student-1', examId: exam.id,
  answerPdfUrl: null, answers: null, writtenAnswers: { q1: 'My answer' },
  marks: 70, feedback: 'Private marking', gradedAt: new Date('2026-09-06T09:00:00Z'),
  submittedAt: new Date('2026-09-06T09:00:00Z'), updatedAt: new Date('2026-09-06T09:00:00Z'),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T09:00:00Z'));
  db.exam.findUnique.mockResolvedValue(exam);
  db.enrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
  db.submission.findUnique.mockResolvedValue(null);
  db.submission.create.mockResolvedValue(submission);
  db.submission.update.mockResolvedValue(submission);
  storage.createR2PresignedPutUrl.mockResolvedValue('https://upload.example/answer');
  storage.r2HeadObject.mockResolvedValue({ exists: true });
});
afterEach(() => vi.useRealTimers());

describe('student attempt authorization and input integrity', () => {
  it('denies non-enrolled students before creating a submission or signing an upload', async () => {
    db.enrollment.findFirst.mockResolvedValue(null);
    await expect(startSubmission('student-1', { examId: exam.id, writtenAnswers: { q1: 'Answer' } }))
      .rejects.toMatchObject({ code: 'NOT_ENROLLED', statusCode: 403 });
    expect(db.submission.create).not.toHaveBeenCalled();
    expect(storage.createR2PresignedPutUrl).not.toHaveBeenCalled();
  });

  it('checks active enrollment in the exact exam course, irrespective of attendance channel', async () => {
    await startSubmission('student-1', { examId: exam.id, writtenAnswers: { q1: 'Answer' } });
    expect(db.enrollment.findFirst).toHaveBeenCalledWith({
      where: { userId: 'student-1', courseId: 'course-1', isActive: true }, select: { id: true },
    });
  });

  it('prevents a student from manufacturing an in-class paper record', async () => {
    db.exam.findUnique.mockResolvedValue({ ...exam, type: ExamType.INCLASS });
    await expect(startSubmission('student-1', { examId: exam.id }))
      .rejects.toMatchObject({ code: 'INCLASS_SUBMISSION_NOT_ALLOWED', statusCode: 400 });
    expect(db.submission.create).not.toHaveBeenCalled();
  });

  it('rejects published exams even if their time window was changed', async () => {
    db.exam.findUnique.mockResolvedValue({ ...exam, isPublished: true });
    await expect(startSubmission('student-1', { examId: exam.id, writtenAnswers: { q1: 'Answer' } }))
      .rejects.toMatchObject({ code: 'RESULTS_ALREADY_PUBLISHED', statusCode: 409 });
    expect(db.submission.create).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous typed-plus-PDF attempt before creating a row', async () => {
    await expect(startSubmission('student-1', {
      examId: exam.id, writtenAnswers: { q1: 'Answer' }, fileName: 'answer.pdf',
      contentType: 'application/pdf', fileSizeBytes: 100,
    })).rejects.toMatchObject({ code: 'MULTIPLE_WRITTEN_CHANNELS', statusCode: 400 });
    expect(db.submission.create).not.toHaveBeenCalled();
  });

  it.each([
    { fileName: 'answer.pdf' },
    { fileName: 'answer.pdf', contentType: 'application/pdf' as const },
    { contentType: 'application/pdf' as const, fileSizeBytes: 100 },
  ])('rejects incomplete PDF metadata %j before creating an unusable attempt', async (metadata) => {
    await expect(startSubmission('student-1', { examId: exam.id, ...metadata }))
      .rejects.toMatchObject({ code: 'FILE_METADATA_REQUIRED', statusCode: 400 });
    expect(db.submission.create).not.toHaveBeenCalled();
  });

  it('stores automatic MCQ grades while withholding the unpublished result from the response', async () => {
    db.exam.findUnique.mockResolvedValue({ ...exam, type: ExamType.MCQ, mcqPayload: {
      questions: [{ id: 'q1', text: 'Two plus two?', order: 1, marks: 10,
        options: [{ id: 'a', text: '4', isCorrect: true }, { id: 'b', text: '5', isCorrect: false }] }],
    } });
    db.submission.create.mockResolvedValue({ ...submission, marks: 10 });
    const result = await startSubmission('student-1', { examId: exam.id, answers: { q1: ['a'] } });
    expect(db.submission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ marks: 10, status: SubmissionStatus.COMPLETED }),
    }));
    expect(result.submission).toMatchObject({ marks: null, feedback: null, gradedAt: null });
  });
});

describe('student completion integrity', () => {
  it('does not finalize an upload after results are published during the grace period', async () => {
    db.submission.findUnique.mockResolvedValue({ ...submission, status: SubmissionStatus.UPLOADING,
      exam: { ...exam, endTime: new Date('2026-09-06T08:59:30Z'), isPublished: true },
    });
    await expect(completeSubmission(submission.id, 'student-1', { key: 'answers/exam-1/student-1/a.pdf' }))
      .rejects.toMatchObject({ code: 'RESULTS_ALREADY_PUBLISHED', statusCode: 409 });
    expect(storage.r2HeadObject).not.toHaveBeenCalled();
    expect(db.submission.update).not.toHaveBeenCalled();
  });

  it('does not finalize an upload for a deleted exam', async () => {
    db.submission.findUnique.mockResolvedValue({ ...submission, status: SubmissionStatus.UPLOADING,
      exam: { ...exam, deletedAt: new Date() },
    });
    await expect(completeSubmission(submission.id, 'student-1', { key: 'answers/exam-1/student-1/a.pdf' }))
      .rejects.toMatchObject({ code: 'EXAM_NOT_FOUND', statusCode: 404 });
    expect(db.submission.update).not.toHaveBeenCalled();
  });

  it('requires continued enrollment before finalizing an upload', async () => {
    db.submission.findUnique.mockResolvedValue({ ...submission, status: SubmissionStatus.UPLOADING, exam });
    db.enrollment.findFirst.mockResolvedValue(null);
    await expect(completeSubmission(submission.id, 'student-1', { key: 'answers/exam-1/student-1/a.pdf' }))
      .rejects.toMatchObject({ code: 'NOT_ENROLLED', statusCode: 403 });
    expect(db.submission.update).not.toHaveBeenCalled();
  });

  it('requires the actual upload key for an UPLOADING attempt', async () => {
    db.submission.findUnique.mockResolvedValue({ ...submission, status: SubmissionStatus.UPLOADING, exam });
    await expect(completeSubmission(submission.id, 'student-1', {}))
      .rejects.toMatchObject({ code: 'UPLOAD_KEY_REQUIRED', statusCode: 400 });
    expect(db.submission.update).not.toHaveBeenCalled();
  });

  it('does not reveal unpublished marks by replaying completion on a graded attempt', async () => {
    db.submission.findUnique.mockResolvedValue({ ...submission, exam });
    const result = await completeSubmission(submission.id, 'student-1');
    expect(result).toMatchObject({ marks: null, feedback: null, gradedAt: null });
    expect(result).not.toHaveProperty('exam');
    expect(db.submission.update).not.toHaveBeenCalled();
  });

  it('preserves published results on an owned already-completed attempt', async () => {
    db.submission.findUnique.mockResolvedValue({ ...submission, exam: { ...exam, isPublished: true } });
    const result = await completeSubmission(submission.id, 'student-1');
    expect(result).toMatchObject({ marks: 70, feedback: 'Private marking' });
    expect(result).not.toHaveProperty('exam');
  });

  it('rejects another student before exposing completed results or calling storage', async () => {
    db.submission.findUnique.mockResolvedValue({ ...submission, exam });
    await expect(completeSubmission(submission.id, 'student-2'))
      .rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(storage.r2HeadObject).not.toHaveBeenCalled();
  });
});
