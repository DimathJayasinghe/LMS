import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as SubmissionService from '@/services/submission.service';
import * as AuditService from '@/services/audit.service';
import * as SmsNotificationService from '@/services/sms-notification.service';
import { AUDIT_ACTION } from '@/utils/constants';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import {
  startSubmissionSchema,
  completeSubmissionSchema,
  listSubmissionsParamsSchema,
  listSubmissionsQuerySchema,
  submissionIdParamSchema,
  submitMarksSchema,
  publishResultsParamsSchema,
} from '@/schemas/submission.schema';

// ─── Start Submission ─────────────────────────────────────

export const startSubmission = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const input = startSubmissionSchema.parse(req.body);
    const result = await SubmissionService.startSubmission(req.user!.userId, input);

    res.status(201).json({
      status: 'success',
      data: result,
      message: 'Submission started successfully.',
    });
  },
);

// ─── Complete Upload ──────────────────────────────────────

export const completeSubmission = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = completeSubmissionSchema.parse(req.params);
    const submission = await SubmissionService.completeSubmission(id, req.user!.userId);

    res.status(200).json({
      status: 'success',
      data: submission,
      message: 'Submission marked as complete.',
    });
  },
);

// ─── List Submissions by Exam ─────────────────────────────

export const listSubmissions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { examId } = listSubmissionsParamsSchema.parse(req.params);
    const query = listSubmissionsQuerySchema.parse(req.query);
    const submissions = await SubmissionService.listSubmissions(
      examId,
      query,
      req.user!.userId,
      req.user!.role,
    );

    res.status(200).json({
      status: 'success',
      data: submissions,
      count: submissions.length,
    });
  },
);

// ─── Submit Marks ──────────────────────────────────────────

export const submitMarks = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = submissionIdParamSchema.parse(req.params);
    const input = submitMarksSchema.parse(req.body);
    const submission = await SubmissionService.submitMarks(id, input, req.user!.userId);

    void AuditService.log({
      action: AUDIT_ACTION.MARKS_SUBMITTED,
      description: `Marks ${input.marks} submitted`,
      targetType: 'Submission',
      targetId: id,
      metadata: { marks: input.marks, feedback: input.feedback ?? null },
      context: extractAuditContext(req),
    });

    res.status(200).json({
      status: 'success',
      data: submission,
      message: 'Marks submitted successfully.',
    });
  },
);

// ─── Publish Results ──────────────────────────────────────

export const publishResults = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { examId } = publishResultsParamsSchema.parse(req.params);
    const result = await SubmissionService.publishResults(examId);

    void AuditService.log({
      action: AUDIT_ACTION.RESULTS_PUBLISHED,
      description: `Results published for "${result.examTitle}"`,
      targetType: 'Exam',
      targetId: examId,
      metadata: {
        totalSubmissions: result.totalSubmissions,
        gradedSubmissions: result.gradedSubmissions,
      },
      context: extractAuditContext(req),
    });

    // SMS to all students who submitted for this exam
    void sendResultsSms(examId, result.examTitle);

    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Results published successfully.',
    });
  },
);

// ─── SMS Helpers ──────────────────────────────────────────

/**
 * Send SMS to all students who submitted for an exam when results are published.
 * Queries submissions → users with phone numbers, then fires bulk SMS.
 */
const sendResultsSms = async (examId: string, examTitle: string): Promise<void> => {
  try {
    type SubmissionRecipient = { user: { id: string; phone: string | null } };

    const submissions: SubmissionRecipient[] = await prisma.submission.findMany({
      where: { examId },
      select: {
        user: { select: { id: true, phone: true } },
      },
    });

    const recipients = submissions
      .filter((s) => s.user.phone)
      .map((s) => ({ phoneNumber: s.user.phone!, userId: s.user.id }));

    if (recipients.length === 0) return;

    await SmsNotificationService.sendBulkSms(
      recipients,
      'RESULTS_PUBLISHED',
      { examTitle },
    );
  } catch (err) {
    logger.error({ err, examId }, 'Failed to enqueue results SMS — non-blocking');
  }
};

