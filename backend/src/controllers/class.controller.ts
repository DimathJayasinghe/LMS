import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as ClassService from '@/services/class.service';
import {
	classIdParamSchema,
	createClassSchema,
	listClassesQuerySchema,
	updateClassSchema,
} from '@/schemas/class.schema';

export const createClass = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const input = createClassSchema.parse(req.body);
	const classData = await ClassService.createClass(input);

	res.status(201).json({
		status: 'success',
		data: classData,
		message: 'Class created successfully.',
	});
});

export const listClasses = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listClassesQuerySchema.parse(req.query);
	const classes = await ClassService.listClasses(query, req.user!.role);

	res.status(200).json({
		status: 'success',
		data: classes,
		count: classes.length,
	});
});

export const getClassById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const classData = await ClassService.getClassById(classId, req.user!.role);

	res.status(200).json({
		status: 'success',
		data: classData,
	});
});

export const updateClass = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const input = updateClassSchema.parse(req.body);
	const classData = await ClassService.updateClass(classId, input);

	res.status(200).json({
		status: 'success',
		data: classData,
		message: 'Class updated successfully.',
	});
});
