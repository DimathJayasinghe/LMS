import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as ExamService from '@/services/exam.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
	assignMarkersSchema,
	createExamSchema,
	examIdParamSchema,
	examUploadUrlSchema,
	examPaperConfirmSchema,
	listExamsQuerySchema,
	updateExamSchema,
} from '@/schemas/exam.schema';

export const createExam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = createExamSchema.parse(req.body);
	const exam = await ExamService.createExam(input, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.EXAM_CREATED,
		description: `Exam "${exam.title}" created`,
		targetType: 'Exam',
		targetId: exam.id,
		context: extractAuditContext(req),
	});

	res.status(201).json({
		status: 'success',
		data: exam,
		message: 'Exam created successfully.',
	});
});

export const listExams = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listExamsQuerySchema.parse(req.query);
	const exams = await ExamService.listExams(query, req.user!);

	res.status(200).json({
		status: 'success',
		data: exams,
		count: exams.length,
	});
});

export const getExamById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = examIdParamSchema.parse(req.params);
	const exam = await ExamService.getExamById(id, req.user!);

	res.status(200).json({
		status: 'success',
		data: exam,
	});
});

export const updateExam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = examIdParamSchema.parse(req.params);
	const input = updateExamSchema.parse(req.body);
	const exam = await ExamService.updateExam(id, input, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.EXAM_UPDATED,
		targetType: 'Exam',
		targetId: id,
		context: extractAuditContext(req),
	});

	res.status(200).json({
		status: 'success',
		data: exam,
		message: 'Exam updated successfully.',
	});
});

export const deleteExam = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = examIdParamSchema.parse(req.params);
	const exam = await ExamService.deleteExam(id, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.EXAM_DELETED,
		description: `Exam "${exam.title}" soft-deleted`,
		targetType: 'Exam',
		targetId: id,
		context: extractAuditContext(req),
	});

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
		const upload = await ExamService.generateExamPaperUploadUrl(id, input, req.user!);

		void AuditService.log({
			action: AUDIT_ACTION.EXAM_UPLOAD_URL,
			targetType: 'Exam',
			targetId: id,
			context: extractAuditContext(req),
		});

		res.status(200).json({
			status: 'success',
			data: upload,
			message: 'Upload URL generated successfully.',
		});
	},
);

export const confirmPaperUpload = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = examIdParamSchema.parse(req.params);
		const input = examPaperConfirmSchema.parse(req.body);
		const result = await ExamService.confirmExamPaper(id, input, req.user!);

		res.status(200).json({
			status: 'success',
			data: result,
			message: 'Paper upload confirmed.',
		});
	},
);

export const assignMarkers = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = examIdParamSchema.parse(req.params);
		const input = assignMarkersSchema.parse(req.body);
		const result = await ExamService.assignMarkersToExam(id, input, req.user!);

		void AuditService.log({
			action: AUDIT_ACTION.MARKERS_ASSIGNED,
			description: `${result.assignedCount} markers assigned`,
			targetType: 'Exam',
			targetId: id,
			metadata: { markerIds: result.assignedMarkerIds },
			context: extractAuditContext(req),
		});

		res.status(200).json({
			status: 'success',
			data: result,
			message: 'Markers assigned successfully.',
		});
	},
);

