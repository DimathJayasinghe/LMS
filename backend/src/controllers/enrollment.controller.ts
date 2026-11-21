import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as EnrollmentService from '@/services/enrollment.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
	createEnrollmentSchema,
	enrollmentIdParamSchema,
	listEnrollmentsQuerySchema,
	listMyEnrollmentsQuerySchema,
	learningCourseParamSchema,
} from '@/schemas/enrollment.schema';

export const createEnrollment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = createEnrollmentSchema.parse(req.body);
	const enrollment = await EnrollmentService.createEnrollment(input, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.ENROLLMENT_CREATED,
		description: `Enrolled user ${enrollment.userId} in "${enrollment.course.name}" (${enrollment.classType})`,
		targetType: 'Enrollment',
		targetId: enrollment.id,
		context: extractAuditContext(req),
	});

	res.status(201).json({
		status: 'success',
		data: enrollment,
		message: 'Enrolled successfully.',
	});
});

export const listMyEnrollments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listMyEnrollmentsQuerySchema.parse(req.query);
	const enrollments = await EnrollmentService.listMyEnrollments(req.user!, query);

	res.status(200).json({
		status: 'success',
		data: enrollments,
		count: enrollments.length,
	});
});

export const listMyLearningCourses = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const courses = await EnrollmentService.listMyLearningCourses(req.user!.userId);
		res.status(200).json({ status: 'success', data: courses, count: courses.length });
	},
);

export const markCourseContentSeen = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { courseId } = learningCourseParamSchema.parse(req.params);
		const progress = await EnrollmentService.markCourseContentSeen(req.user!.userId, courseId);
		res.status(200).json({ status: 'success', data: progress });
	},
);

export const listEnrollments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listEnrollmentsQuerySchema.parse(req.query);
	const { items, total } = await EnrollmentService.listEnrollments(query);

	res.status(200).json({
		status: 'success',
		data: items,
		count: total,
		page: query.page,
		limit: query.limit,
	});
});

export const getEnrollmentById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = enrollmentIdParamSchema.parse(req.params);
	const enrollment = await EnrollmentService.getEnrollmentById(id, req.user!);

	res.status(200).json({
		status: 'success',
		data: enrollment,
	});
});

export const cancelEnrollment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = enrollmentIdParamSchema.parse(req.params);
	const enrollment = await EnrollmentService.cancelEnrollment(id, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.ENROLLMENT_CANCELLED,
		description: `Cancelled enrollment ${id}`,
		targetType: 'Enrollment',
		targetId: id,
		context: extractAuditContext(req),
	});

	res.status(200).json({
		status: 'success',
		data: enrollment,
		message: 'Enrollment cancelled.',
	});
});
