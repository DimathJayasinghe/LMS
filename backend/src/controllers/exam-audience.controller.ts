import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { examIdParamSchema } from '@/schemas/exam.schema';
import { eligibleStudentsQuerySchema, replaceExamAudiencesSchema, replaceExamParticipantsSchema } from '@/schemas/exam-audience.schema';
import * as AudienceService from '@/services/exam-audience.service';
export const getConfiguration = asyncHandler(async (req: Request, res: Response) => { const { id } = examIdParamSchema.parse(req.params); const result = await AudienceService.getExamConfiguration(id, req.user!); res.status(200).json({ status: 'success', data: result }); });
export const replaceAudiences = asyncHandler(async (req: Request, res: Response) => { const { id } = examIdParamSchema.parse(req.params); const result = await AudienceService.replaceExamAudiences(id, replaceExamAudiencesSchema.parse(req.body), req.user!); res.status(200).json({ status: 'success', data: result, message: 'Exam audiences updated.' }); });
export const replaceParticipants = asyncHandler(async (req: Request, res: Response) => { const { id } = examIdParamSchema.parse(req.params); await AudienceService.replaceExamParticipants(id, replaceExamParticipantsSchema.parse(req.body), req.user!); res.status(200).json({ status: 'success', message: 'Exam roster updated.' }); });
export const listEligibleStudents = asyncHandler(async (req: Request, res: Response) => { const { id } = examIdParamSchema.parse(req.params); const query = eligibleStudentsQuerySchema.parse(req.query); const result = await AudienceService.listEligibleExamParticipants(id, query.page, query.pageSize, req.user!); res.status(200).json({ status: 'success', data: result.items, page: result.page, pageSize: result.pageSize, total: result.total }); });
