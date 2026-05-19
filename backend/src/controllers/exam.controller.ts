import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as ExamService from '@/services/exam.service';
import {
	assignMarkersSchema,
	createExamSchema,
	examIdParamSchema,
	examUploadUrlSchema,
	listExamsQuerySchema,
	updateExamSchema,
} from '@/schemas/exam.schema';

export const createExam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = createExamSchema.parse(req.body);
	const exam = await ExamService.createExam(input);

	res.status(201).json({
		status: 'success',
		data: exam,
		message: 'Exam created successfully.',
	});
});

export const listExams = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listExamsQuerySchema.parse(req.query);
	const exams = await ExamService.listExams(query, req.user!.role);

	res.status(200).json({
		status: 'success',
		data: exams,
		count: exams.length,
	});
});

export const getExamById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = examIdParamSchema.parse(req.params);
	const exam = await ExamService.getExamById(id, req.user!.role);

	res.status(200).json({
		status: 'success',
		data: exam,
	});
});

export const updateExam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = examIdParamSchema.parse(req.params);
	const input = updateExamSchema.parse(req.body);
	const exam = await ExamService.updateExam(id, input);

	res.status(200).json({
		status: 'success',
		data: exam,
		message: 'Exam updated successfully.',
	});
});

export const deleteExam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = examIdParamSchema.parse(req.params);
	const exam = await ExamService.deleteExam(id);

	res.status(200).json({
		status: 'success',
		data: exam,
		message: 'Exam deleted successfully.',
	});
});

export const getPaperUploadUrl = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = examIdParamSchema.parse(req.params);
		const input = examUploadUrlSchema.parse(req.body);
		const upload = await ExamService.generateExamPaperUploadUrl(id, input);

		res.status(200).json({
			status: 'success',
			data: upload,
			message: 'Upload URL generated successfully.',
		});
	},
);

export const assignMarkers = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = examIdParamSchema.parse(req.params);
		const input = assignMarkersSchema.parse(req.body);
		const result = await ExamService.assignMarkersToExam(id, input);

		res.status(200).json({
			status: 'success',
			data: result,
			message: 'Markers assigned successfully.',
		});
	},
);
