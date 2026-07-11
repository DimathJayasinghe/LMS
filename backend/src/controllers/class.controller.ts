import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import * as ClassService from '@/services/class.service';
import * as AuditService from '@/services/audit.service';
import { AUDIT_ACTION } from '@/utils/constants';
import {
	classIdParamSchema,
	createClassSchema,
	listClassesQuerySchema,
	listPublicClassesQuerySchema,
	updateClassSchema,
} from '@/schemas/class.schema';

export const createClass = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = createClassSchema.parse(req.body);
	const classData = await ClassService.createClass(input, req.user!);

	void AuditService.log({
		action: AUDIT_ACTION.CLASS_CREATED,
		description: `Class "${classData.name} ${classData.year}" created`,
		targetType: 'Course',
		targetId: classData.id,
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
		action: AUDIT_ACTION.CLASS_UPDATED,
		targetType: 'Course',
		targetId: classId,
		context: extractAuditContext(req),
	});

	res.status(200).json({
		status: 'success',
		data: classData,
		message: 'Class updated successfully.',
	});
});

