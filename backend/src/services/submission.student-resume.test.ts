import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamType, SubmissionStatus } from '@prisma/client';

const db = vi.hoisted(() => ({
  exam: { findUnique: vi.fn() },
  enrollment: { findFirst: vi.fn() },
  submission: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  examParticipant: { findUnique: vi.fn() },
  $executeRaw: vi.fn(), $transaction: vi.fn(),
}));
const storage = vi.hoisted(() => ({ createR2PresignedPutUrl: vi.fn(), createR2PresignedGetUrl: vi.fn(), r2HeadObject: vi.fn() }));
vi.mock('@/config/database', () => ({ prisma: db }));
vi.mock('@/utils/r2', () => storage);
vi.mock('@/services/class.service', () => ({ assertCourseAccess: vi.fn() }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/services/notification.service', () => ({}));
import { startSubmission } from './submission.service';

const legacy = {
  id: 'exam-1', title: 'Paper', type: ExamType.WRITTEN, courseId: 'course-1', paperRevisionId: null,
  startTime: new Date('2026-09-06T08:00:00Z'), endTime: new Date('2026-09-06T10:00:00Z'),
  totalMarks: 100, isPublished: false, deletedAt: null, mcqPayload: null, allowTypedAnswers: true, allowPdfUpload: true,
};
const scoped = { ...legacy, paperRevisionId: 'revision-1' };
const row = (over: Record<string, unknown> = {}) => ({
  id: 'submission-1', status: SubmissionStatus.UPLOADING, userId: 'student-1', examId: 'exam-1', answerPdfUrl: null,
  answers: null, writtenAnswers: null, marks: null, feedback: null, gradedAt: null, gradedById: null, source: 'ONLINE',
  submittedAt: new Date('2026-09-06T08:30:00Z'), updatedAt: new Date('2026-09-06T08:30:00Z'), ...over,
});
const audience = (deliveryMode: 'ONLINE' | 'PHYSICAL') => ({ audience: { id: 'aud-1', label: 'Group', deliveryMode, institute: null } });
const pdf = { examId: 'exam-1', fileName: 'answer.pdf', contentType: 'application/pdf' as const, fileSizeBytes: 1000 };
const typed = { examId: 'exam-1', writtenAnswers: { q1: 'My answer' } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T09:00:00Z'));
  db.exam.findUnique.mockResolvedValue(legacy);
  db.enrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
  db.submission.findUnique.mockResolvedValue(null);
  db.submission.create.mockResolvedValue(row());
  db.submission.update.mockResolvedValue(row());
  db.examParticipant.findUnique.mockResolvedValue(audience('ONLINE'));
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  storage.createR2PresignedPutUrl.mockResolvedValue('https://upload.example/answer');
});
afterEach(() => vi.useRealTimers());

const nothingWritten = () => {
  expect(db.submission.create).not.toHaveBeenCalled();
  expect(db.submission.update).not.toHaveBeenCalled();
  expect(storage.createR2PresignedPutUrl).not.toHaveBeenCalled();
};

describe('startSubmission: the audience is derived from the roster', () => {
  beforeEach(() => db.exam.findUnique.mockResolvedValue(scoped));

  it('starts for an online participant who sends no audience', async () => {
    const result = await startSubmission('student-1', pdf);
    expect(db.examParticipant.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { examId_userId: { examId: 'exam-1', userId: 'student-1' } } }));
    expect(db.submission.create).toHaveBeenCalledTimes(1);
    expect(result.uploadUrl).toBe('https://upload.example/answer');
  });

  it('starts when a sent audience is the student own', async () => {
    await startSubmission('student-1', { ...typed, audienceId: 'aud-1' });
    expect(db.submission.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a sent audience that is not the student own, writing nothing', async () => {
    await expect(startSubmission('student-1', { ...typed, audienceId: '00000000-0000-4000-8000-000000000009' }))
      .rejects.toMatchObject({ code: 'EXAM_AUDIENCE_MISMATCH', statusCode: 400 });
    nothingWritten();
  });

  it('tells a hall participant the paper is sat in the hall, writing nothing', async () => {
    db.examParticipant.findUnique.mockResolvedValue(audience('PHYSICAL'));
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'EXAM_PHYSICAL_AUDIENCE', statusCode: 409 });
    nothingWritten();
  });

  it('refuses a student who is not on the list, writing nothing', async () => {
    db.examParticipant.findUnique.mockResolvedValue(null);
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'EXAM_PARTICIPANT_NOT_FOUND', statusCode: 403 });
    nothingWritten();
  });

  it('checks enrollment before the participant row', async () => {
    db.enrollment.findFirst.mockResolvedValue(null);
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'NOT_ENROLLED', statusCode: 403 });
    expect(db.examParticipant.findUnique).not.toHaveBeenCalled();
  });

  it('rechecks the roster inside the locked transaction, so a student removed meanwhile cannot start', async () => {
    db.examParticipant.findUnique.mockResolvedValueOnce(audience('ONLINE')).mockResolvedValueOnce(null);
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'EXAM_PARTICIPANT_NOT_FOUND', statusCode: 403 });
    expect(db.examParticipant.findUnique).toHaveBeenCalledTimes(2);
    nothingWritten();
  });

  it('leaves a legacy exam alone: no roster lookup at all', async () => {
    db.exam.findUnique.mockResolvedValue(legacy);
    await startSubmission('student-1', typed);
    expect(db.examParticipant.findUnique).not.toHaveBeenCalled();
  });
});

describe('startSubmission: an unfinished upload is resumed, not refused', () => {
  it('reuses the row for a retry and returns a fresh upload URL', async () => {
    db.submission.findUnique.mockResolvedValue(row());
    const result = await startSubmission('student-1', pdf);
    expect(db.submission.create).not.toHaveBeenCalled();
    expect(db.submission.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'submission-1' }, data: expect.objectContaining({ status: SubmissionStatus.UPLOADING }),
    }));
    expect(storage.createR2PresignedPutUrl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ uploadUrl: 'https://upload.example/answer', uploadKey: 'answers/exam-1/student-1/answer.pdf' });
  });

  it('lets the student switch to typed answers, which completes the row without an upload', async () => {
    db.submission.findUnique.mockResolvedValue(row());
    db.submission.update.mockResolvedValue(row({ status: SubmissionStatus.COMPLETED, writtenAnswers: typed.writtenAnswers }));
    const result = await startSubmission('student-1', typed);
    expect(db.submission.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'submission-1' }, data: expect.objectContaining({ status: SubmissionStatus.COMPLETED, writtenAnswers: typed.writtenAnswers }),
    }));
    expect(storage.createR2PresignedPutUrl).not.toHaveBeenCalled();
    expect(result.uploadUrl).toBeUndefined();
  });

  it('keeps the marking fields of the response empty, as for a first start', async () => {
    db.submission.findUnique.mockResolvedValue(row());
    const result = await startSubmission('student-1', pdf);
    expect(result.submission).toMatchObject({ marks: null, feedback: null, gradedAt: null });
  });

  it('still refuses a completed submission', async () => {
    db.submission.findUnique.mockResolvedValue(row({ status: SubmissionStatus.COMPLETED }));
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED', statusCode: 409 });
    nothingWritten();
  });

  it('still refuses an UPLOADING row that already holds a stored file', async () => {
    db.submission.findUnique.mockResolvedValue(row({ answerPdfUrl: 'answers/exam-1/student-1/old.pdf' }));
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED', statusCode: 409 });
    nothingWritten();
  });

  it('refuses a resume once results are published', async () => {
    db.exam.findUnique.mockResolvedValue({ ...legacy, isPublished: true });
    db.submission.findUnique.mockResolvedValue(row());
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'RESULTS_ALREADY_PUBLISHED', statusCode: 409 });
    nothingWritten();
  });

  it('refuses a resume after the exam has ended, whatever the row says', async () => {
    vi.setSystemTime(new Date('2026-09-06T10:00:01Z'));
    db.submission.findUnique.mockResolvedValue(row());
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'EXAM_ENDED', statusCode: 400 });
    nothingWritten();
  });

  it('applies the audience rule to a resume too', async () => {
    db.exam.findUnique.mockResolvedValue(scoped);
    db.examParticipant.findUnique.mockResolvedValue(audience('PHYSICAL'));
    db.submission.findUnique.mockResolvedValue(row());
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'EXAM_PHYSICAL_AUDIENCE', statusCode: 409 });
    nothingWritten();
  });

  it('decides again under the lock: a row completed meanwhile is refused', async () => {
    db.submission.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: SubmissionStatus.COMPLETED }));
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED', statusCode: 409 });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    nothingWritten();
  });

  it('decides again under the lock: a row created meanwhile and unfinished is resumed, not duplicated', async () => {
    db.submission.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row());
    await startSubmission('student-1', pdf);
    expect(db.submission.create).not.toHaveBeenCalled();
    expect(db.submission.update).toHaveBeenCalledTimes(1);
  });

  it('serializes two resumes under the exam lock', async () => {
    db.submission.findUnique.mockResolvedValue(row());
    await startSubmission('student-1', pdf);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('asks a hybrid resume for the MCQ answers again', async () => {
    db.exam.findUnique.mockResolvedValue({ ...legacy, type: ExamType.HYBRID });
    db.submission.findUnique.mockResolvedValue(row());
    await expect(startSubmission('student-1', pdf)).rejects.toMatchObject({ code: 'MCQ_ANSWERS_REQUIRED', statusCode: 400 });
    nothingWritten();
  });
});
