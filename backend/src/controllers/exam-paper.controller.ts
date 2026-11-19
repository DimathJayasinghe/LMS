import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { createExamPaperSchema, paperIdParamSchema, paperRevisionSchema } from '@/schemas/exam-paper.schema';
import * as PaperService from '@/services/exam-paper.service';
export const createExamPaper = asyncHandler(async (req: Request, res: Response) => { const paper = await PaperService.createExamPaper(createExamPaperSchema.parse(req.body), req.user!); res.status(201).json({ status: 'success', data: paper }); });
export const createRevision = asyncHandler(async (req: Request, res: Response) => { const { id } = paperIdParamSchema.parse(req.params); const revision = await PaperService.createExamPaperRevision(id, paperRevisionSchema.parse(req.body), req.user!); res.status(201).json({ status: 'success', data: revision }); });
