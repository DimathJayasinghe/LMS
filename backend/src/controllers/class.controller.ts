import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as ClassService from '@/services/class.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
	classIdParamSchema,
	courseAssetConfirmSchema,
	courseAssetAltSchema,
	courseAssetParamsSchema,
	courseAssetUploadUrlSchema,
	createClassSchema,
	listClassesQuerySchema,
	listPublicClassesQuerySchema,
	updateClassSchema,
} from '@/schemas/class.schema';

export const getCourseAssetUploadUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const input = courseAssetUploadUrlSchema.parse(req.body);
	const data = await ClassService.generateCourseAssetUploadUrl(classId, input, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.COURSE_ASSET_UPLOAD_URL,
		description: `${input.kind === 'BANNER' ? 'Banner' : 'Backdrop'} upload authorized`,
		targetType: 'Course',
		targetId: classId,
		metadata: { kind: input.kind, fileSizeBytes: input.fileSizeBytes, contentType: input.contentType },
		context: extractAuditContext(req),
	});

	res.status(200).json({ status: 'success', data });
});

export const confirmCourseAsset = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const input = courseAssetConfirmSchema.parse(req.body);
	const data = await ClassService.confirmCourseAsset(classId, input, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.COURSE_ASSET_UPDATED,
		description: `${input.kind === 'BANNER' ? 'Banner' : 'Backdrop'} updated for class "${data.name}"`,
		targetType: 'Course',
		targetId: classId,
		metadata: { kind: input.kind },
		context: extractAuditContext(req),
	});

	res.status(200).json({ status: 'success', data, message: 'Class image updated.' });
});

export const removeCourseAsset = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, kind } = courseAssetParamsSchema.parse(req.params);
	const normalizedKind = kind.toUpperCase() as 'BANNER' | 'BACKDROP';
	const result = await ClassService.removeCourseAsset(classId, normalizedKind, req.user!);

	if (result.removed) {
		void AuditService.log({
			action: AUDIT_ACTION.COURSE_ASSET_REMOVED,
			description: `${kind === 'banner' ? 'Banner' : 'Backdrop'} removed from class "${result.course.name}"`,
			targetType: 'Course',
			targetId: classId,
			metadata: { kind: normalizedKind },
			context: extractAuditContext(req),
		});
	}

	res.status(200).json({ status: 'success', data: result.course, message: 'Class image removed.' });
});

export const updateCourseAssetAlt = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, kind } = courseAssetParamsSchema.parse(req.params);
	const input = courseAssetAltSchema.parse(req.body);
	const normalizedKind = kind.toUpperCase() as 'BANNER' | 'BACKDROP';
	const data = await ClassService.updateCourseAssetAlt(classId, normalizedKind, input, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.COURSE_ASSET_UPDATED,
		description: `${kind === 'banner' ? 'Banner' : 'Backdrop'} description updated for class "${data.name}"`,
		targetType: 'Course',
		targetId: classId,
		metadata: { kind: normalizedKind, changedFields: ['altText'] },
		context: extractAuditContext(req),
	});

	res.status(200).json({ status: 'success', data, message: 'Image description updated.' });
});

export const createClass = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = createClassSchema.parse(req.body);
	const classData = await ClassService.createClass(input, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.CLASS_CREATED,
		description: `Class "${classData.name} ${classData.year}" created`,
		targetType: 'Course',
		targetId: classData.id,
		metadata: { subjectId: classData.subjectId, teacherId: classData.teacherId },
		context: extractAuditContext(req),
	});

	res.status(201).json({
		status: 'success',
		data: classData,
		message: 'Class created successfully.',
	});
});

export const listPublicClasses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listPublicClassesQuerySchema.parse(req.query);
	const classes = await ClassService.listPublicClasses(query);

	res.status(200).json({
		status: 'success',
		data: classes,
		count: classes.length,
	});
});

export const listClasses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listClassesQuerySchema.parse(req.query);
	const classes = await ClassService.listClasses(query, req.user!);

	res.status(200).json({
		status: 'success',
		data: classes,
		count: classes.length,
	});
});

export const getClassById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const classData = await ClassService.getClassById(classId, req.user!);

	res.status(200).json({
		status: 'success',
		data: classData,
	});
});

export const updateClass = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const input = updateClassSchema.parse(req.body);
	const classData = await ClassService.updateClass(classId, input, req.user!);

	void AuditService.log({
		action:
			req.user!.role === Role.SUPER_ADMIN && input.teacherId
				? AUDIT_ACTION.COURSE_TEACHER_ASSIGNED
				: AUDIT_ACTION.CLASS_UPDATED,
		description:
			req.user!.role === Role.SUPER_ADMIN && input.teacherId
				? `Teacher assigned to class "${classData.name}"`
				: `Class "${classData.name}" updated`,
		targetType: 'Course',
		targetId: classId,
		metadata: {
			subjectId: classData.subjectId,
			teacherId: classData.teacherId,
			changedFields: Object.keys(input),
		},
		context: extractAuditContext(req),
	});

	res.status(200).json({
		status: 'success',
		data: classData,
		message: 'Class updated successfully.',
	});
});
