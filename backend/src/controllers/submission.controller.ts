import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as SubmissionService from '@/services/submission.service';
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

    res.status(200).json({
      status: 'success',
      data: result,
      message: 'Results published successfully.',
    });
  },
);
