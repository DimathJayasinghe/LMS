import { ExamType, Prisma, Role, SubmissionStatus } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { ANSWER_PDF_KEY_PREFIX, ANSWER_PDF_URL_TTL_SECONDS } from '@/utils/constants';
import { createR2PresignedGetUrl, createR2PresignedPutUrl } from '@/utils/r2';
import { mcqPayloadSchema } from '@/schemas/exam.schema';
import type {
  StartSubmissionInput,
  SubmitMarksInput,
  ListSubmissionsQuery,
  McqAnswersInput,
} from '@/schemas/submission.schema';
import * as StreamService from '@/services/stream.service';

// ─── Types ────────────────────────────────────────────────

type McqPayload = Prisma.JsonObject & {
  questions: Array<{
    id: string;
    text: string;
    order: number;
    marks: number;
    options: Array<{ id: string; text: string; isCorrect: boolean }>;
  }>;
};

interface SubmissionListItem {
  id: string;
  status: SubmissionStatus;
  answerPdfUrl: string | null;
  marks: number | null;
  feedback: string | null;
  submittedAt: Date;
  gradedAt: Date | null;
  user: { id: string; name: string; email: string; indexNumber: number };
}

interface SubmissionResult {
  id: string;
  status: SubmissionStatus;
  answerPdfUrl: string | null;
  answers: Prisma.JsonValue | null;
  marks: number | null;
  feedback: string | null;
  examId: string;
  userId: string;
  submittedAt: Date;
  gradedAt: Date | null;
  updatedAt: Date;
}

interface StartSubmissionResult {
  submission: SubmissionResult;
  uploadUrl?: string;
  uploadKey?: string;
  uploadExpiresAt?: Date;
}

interface PublishResult {
  examId: string;
  examTitle: string;
  publishedAt: Date;
  totalSubmissions: number;
  gradedSubmissions: number;
}

// ─── Select shapes ────────────────────────────────────────

const submissionDetailSelect = {
  id: true,
  status: true,
  answerPdfUrl: true,
  answers: true,
  marks: true,
  feedback: true,
  examId: true,
  userId: true,
  submittedAt: true,
  gradedAt: true,
  updatedAt: true,
} satisfies Prisma.SubmissionSelect;

const submissionListSelect = {
  id: true,
  status: true,
  answerPdfUrl: true,
  marks: true,
  feedback: true,
  submittedAt: true,
  gradedAt: true,
  user: { select: { id: true, name: true, email: true, indexNumber: true } },
} satisfies Prisma.SubmissionSelect;

// ─── MCQ Auto-grading ─────────────────────────────────────

const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
};

const gradeSubmission = (
  mcqPayload: McqPayload,
  answers: McqAnswersInput,
): number => {
  let totalScore = 0;

  for (const question of mcqPayload.questions) {
    const correctIds = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.id)
      .sort();

    const selected = (answers[question.id] ?? []).slice().sort();

    // Full marks only if the selected set matches the correct set exactly
    if (arraysEqual(correctIds, selected)) {
      totalScore += question.marks;
    }
  }

  return totalScore;
};

// ─── Helpers ──────────────────────────────────────────────

const ensureExamActive = async (examId: string): Promise<Prisma.ExamGetPayload<{
  select: {
    id: true; title: true; type: true; startTime: true; endTime: true;
    totalMarks: true; isPublished: true; deletedAt: true; mcqPayload: true;
    courseId: true;
  };
}>> => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true, title: true, type: true, startTime: true, endTime: true,
      totalMarks: true, isPublished: true, deletedAt: true, mcqPayload: true,
      courseId: true,
    },
  });

  if (!exam || exam.deletedAt) {
    throw new AppError('EXAM_NOT_FOUND', 404, 'Exam not found.');
  }

  return exam;
};

const ensureMarkerAssigned = async (markerId: string, examId: string): Promise<void> => {
  const assignment = await prisma.markerAssignment.findUnique({
    where: { markerId_examId: { markerId, examId } },
  });

  if (!assignment) {
    throw new AppError(
      'MARKER_NOT_ASSIGNED',
      403,
      'You are not assigned to mark this exam.',
    );
  }
};

// ─── Start Submission ─────────────────────────────────────
// Students call this to begin their submission. Depending on exam type:
// - MCQ: answers are submitted inline and auto-graded immediately
// - WRITTEN: a presigned R2 upload URL is returned for the answer PDF
// - HYBRID: MCQ answers inline + upload URL for the written portion

export const startSubmission = async (
  userId: string,
  input: StartSubmissionInput,
): Promise<StartSubmissionResult> => {
  const exam = await ensureExamActive(input.examId);

  // Server-authoritative time — never trust the client's clock
  const now = new Date();

  if (now < exam.startTime) {
    throw new AppError('EXAM_NOT_STARTED', 400, 'This exam has not started yet.');
  }

  if (now > exam.endTime) {
    throw new AppError('EXAM_ENDED', 400, 'This exam has ended. Submissions are no longer accepted.');
  }

  // Check for existing submission — one per student per exam
  const existing = await prisma.submission.findUnique({
    where: { userId_examId: { userId, examId: input.examId } },
    select: submissionDetailSelect,
  });

  if (existing) {
    throw new AppError('ALREADY_SUBMITTED', 409, 'You have already submitted for this exam.');
  }

  // Validate input based on exam type
  const requiresMcq = exam.type === ExamType.MCQ || exam.type === ExamType.HYBRID;
  const requiresPdf = exam.type === ExamType.WRITTEN || exam.type === ExamType.HYBRID;

  if (requiresMcq && !input.answers) {
    throw new AppError('MCQ_ANSWERS_REQUIRED', 400, 'MCQ answers are required for this exam type.');
  }

  if (requiresPdf && !input.fileName) {
    throw new AppError('FILE_NAME_REQUIRED', 400, 'File name is required for written submissions.');
  }

  // Validate MCQ answers against the exam's question set
  let mcqMarks: number | null = null;
  if (requiresMcq && input.answers) {
    const parsed = mcqPayloadSchema.safeParse(exam.mcqPayload);
    if (!parsed.success) {
      throw new AppError('EXAM_MCQ_CORRUPT', 500, 'The exam MCQ data is corrupt. Please contact admin.');
    }

    const payload = parsed.data as McqPayload;
    validateAnswersAgainstPayload(payload, input.answers);
    mcqMarks = gradeSubmission(payload, input.answers);
  }

  // For MCQ-only exams, submission completes immediately with auto-graded marks
  const isMcqOnly = exam.type === ExamType.MCQ;
  const status = isMcqOnly ? SubmissionStatus.COMPLETED : SubmissionStatus.UPLOADING;

  const submission = await prisma.submission.create({
    data: {
      userId,
      examId: input.examId,
      status,
      answers: input.answers ? (input.answers as unknown as Prisma.InputJsonObject) : Prisma.JsonNull,
      marks: isMcqOnly ? mcqMarks : null,
      gradedAt: isMcqOnly ? new Date() : null,
    },
    select: submissionDetailSelect,
  });

  const result: StartSubmissionResult = { submission };

  // Generate presigned upload URL for answer PDF
  if (requiresPdf && input.fileName && input.contentType) {
    const uploadKey = `${ANSWER_PDF_KEY_PREFIX}/${exam.id}/${userId}/${input.fileName}`;

    const uploadUrl = await createR2PresignedPutUrl(
      uploadKey,
      input.contentType,
      ANSWER_PDF_URL_TTL_SECONDS,
    );

    // Store the R2 key so we know where the file will land
    await prisma.submission.update({
      where: { id: submission.id },
      data: { answerPdfUrl: uploadKey },
    });

    result.uploadUrl = uploadUrl;
    result.uploadKey = uploadKey;
    result.uploadExpiresAt = new Date(Date.now() + ANSWER_PDF_URL_TTL_SECONDS * 1000);
    result.submission.answerPdfUrl = uploadKey;
  }

  return result;
};

// ─── Complete Upload ──────────────────────────────────────
// Called after the student's browser finishes uploading the PDF to R2.
// Updates submission status from UPLOADING → COMPLETED.

export const completeSubmission = async (
  submissionId: string,
  userId: string,
): Promise<SubmissionResult> => {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { ...submissionDetailSelect, exam: { select: { endTime: true } } },
  });

  if (!submission) {
    throw new AppError('SUBMISSION_NOT_FOUND', 404, 'Submission not found.');
  }

  if (submission.userId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only complete your own submission.');
  }

  if (submission.status === SubmissionStatus.COMPLETED) {
    // Idempotent — already completed, just return it
    return submission;
  }

  // Verify server time hasn't passed exam end + grace period
  const now = new Date();
  const graceMs = 60 * 1000; // 1-minute grace for upload completion after exam ends
  if (now > new Date(submission.exam.endTime.getTime() + graceMs)) {
    throw new AppError(
      'EXAM_ENDED',
      400,
      'The exam window has closed. Your upload cannot be finalized.',
    );
  }

  const updated = await prisma.submission.update({
    where: { id: submissionId },
    data: { status: SubmissionStatus.COMPLETED },
    select: submissionDetailSelect,
  });

  return updated;
};

// ─── List Submissions ─────────────────────────────────────
// Admins see all submissions; markers see only for exams they're assigned to.

export const listSubmissions = async (
  examId: string,
  query: ListSubmissionsQuery,
  userId: string,
  role: Role,
): Promise<SubmissionListItem[]> => {
  const exam = await ensureExamActive(examId);

  // Markers can only view submissions for exams they're assigned to
  if (role === Role.MARKER) {
    await ensureMarkerAssigned(userId, examId);
  }

  const statusFilter: Prisma.SubmissionWhereInput =
    query.status === 'UPLOADING'
      ? { status: SubmissionStatus.UPLOADING }
      : query.status === 'COMPLETED'
        ? { status: SubmissionStatus.COMPLETED }
        : {};

  const gradedFilter: Prisma.SubmissionWhereInput =
    query.graded === 'graded'
      ? { marks: { not: null } }
      : query.graded === 'ungraded'
        ? { marks: null }
        : {};

  const submissions = await prisma.submission.findMany({
    where: {
      examId,
      ...statusFilter,
      ...gradedFilter,
    },
    select: submissionListSelect,
    orderBy: { submittedAt: 'asc' },
  });

  // Generate presigned download URLs for answer PDFs
  const results: SubmissionListItem[] = [];
  for (const sub of submissions) {
    let answerPdfUrl: string | null = null;
    if (sub.answerPdfUrl) {
      answerPdfUrl = await createR2PresignedGetUrl(sub.answerPdfUrl, ANSWER_PDF_URL_TTL_SECONDS);
    }

    results.push({
      ...sub,
      answerPdfUrl,
    });
  }

  return results;
};

// ─── Submit Marks ──────────────────────────────────────────
// Markers grade a specific submission. Idempotency is handled at the route level.

export const submitMarks = async (
  submissionId: string,
  input: SubmitMarksInput,
  markerId: string,
): Promise<SubmissionResult> => {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      ...submissionDetailSelect,
      exam: { select: { id: true, totalMarks: true, type: true } },
    },
  });

  if (!submission) {
    throw new AppError('SUBMISSION_NOT_FOUND', 404, 'Submission not found.');
  }

  // Verify the marker is assigned to this exam
  await ensureMarkerAssigned(markerId, submission.exam.id);

  if (submission.status !== SubmissionStatus.COMPLETED) {
    throw new AppError(
      'SUBMISSION_INCOMPLETE',
      400,
      'Cannot grade a submission that is still uploading.',
    );
  }

  // Validate marks against exam total
  if (input.marks > submission.exam.totalMarks) {
    throw new AppError(
      'MARKS_EXCEED_TOTAL',
      400,
      `Marks cannot exceed the exam total of ${submission.exam.totalMarks}.`,
    );
  }

  const updated = await prisma.submission.update({
    where: { id: submissionId },
    data: {
      marks: input.marks,
      feedback: input.feedback ?? null,
      gradedAt: new Date(),
    },
    select: submissionDetailSelect,
  });

  return updated;
};

// ─── Publish Results ──────────────────────────────────────
// Super Admin publishes results — sets exam.isPublished = true,
// making marks visible to students.

export const publishResults = async (examId: string): Promise<PublishResult> => {
  const exam = await ensureExamActive(examId);

  if (exam.isPublished) {
    throw new AppError('ALREADY_PUBLISHED', 400, 'Results for this exam are already published.');
  }

  const now = new Date();
  if (now < exam.endTime) {
    throw new AppError(
      'EXAM_STILL_ACTIVE',
      400,
      'Cannot publish results while the exam is still active.',
    );
  }

  // Count submissions for the response summary
  const [totalSubmissions, gradedSubmissions] = await Promise.all([
    prisma.submission.count({ where: { examId } }),
    prisma.submission.count({ where: { examId, marks: { not: null } } }),
  ]);

  const publishedAt = new Date();

  await prisma.exam.update({
    where: { id: examId },
    data: { isPublished: true },
  });

  await StreamService.broadcastResultsPublished({
    examId,
    courseId: exam.courseId,
    examTitle: exam.title,
    publishedAt: publishedAt.toISOString(),
  });

  return {
    examId,
    examTitle: exam.title,
    publishedAt,
    totalSubmissions,
    gradedSubmissions,
  };
};

// ─── Answer Validation Helper ─────────────────────────────
// Ensures submitted MCQ answers reference valid question/option IDs

const validateAnswersAgainstPayload = (
  payload: McqPayload,
  answers: McqAnswersInput,
): void => {
  const questionIds = new Set(payload.questions.map((q) => q.id));
  const optionMap = new Map<string, Set<string>>();

  for (const question of payload.questions) {
    optionMap.set(question.id, new Set(question.options.map((o) => o.id)));
  }

  for (const [questionId, selectedOptionIds] of Object.entries(answers)) {
    if (!questionIds.has(questionId)) {
      throw new AppError(
        'INVALID_QUESTION_ID',
        400,
        `Answer references unknown question: ${questionId}`,
      );
    }

    const validOptions = optionMap.get(questionId)!;
    for (const optionId of selectedOptionIds) {
      if (!validOptions.has(optionId)) {
        throw new AppError(
          'INVALID_OPTION_ID',
          400,
          `Answer for question ${questionId} references unknown option: ${optionId}`,
        );
      }
    }
  }
};
