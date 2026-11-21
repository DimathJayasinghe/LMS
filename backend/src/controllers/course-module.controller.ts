import { Request, Response } from 'express';
import * as AuditService from '@/services/audit.service';
import * as CourseModuleService from '@/services/course-module.service';
import {
	confirmCourseMaterialSchema,
	courseMaterialUploadUrlSchema,
	createCourseModuleSchema,
	materialParamsSchema,
	moduleParamsSchema,
	updateCourseModuleSchema,
	updateCourseMaterialSchema,
} from '@/schemas/course-module.schema';
import { classIdParamSchema } from '@/schemas/class.schema';
import { asyncHandler } from '@/utils/async-handler';
import { extractAuditContext } from '@/utils/audit-context';
import { AUDIT_ACTION } from '@/utils/constants';

export const listCourseModules = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const data = await CourseModuleService.listCourseModules(classId, req.user!);
	res.status(200).json({ status: 'success', data, count: data.length });
});

export const createCourseModule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId } = classIdParamSchema.parse(req.params);
	const input = createCourseModuleSchema.parse(req.body);
	const data = await CourseModuleService.createCourseModule(classId, input, req.user!);
	void AuditService.log({
		action: AUDIT_ACTION.COURSE_MODULE_CREATED,
		description: `Course module "${data.title}" created`,
		targetType: 'CourseModule',
		targetId: data.id,
		metadata: { classId, status: data.status },
		context: extractAuditContext(req),
	});
	res.status(201).json({ status: 'success', data, message: 'Module created.' });
});

export const updateCourseModule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, moduleId } = moduleParamsSchema.parse(req.params);
	const input = updateCourseModuleSchema.parse(req.body);
	const data = await CourseModuleService.updateCourseModule(classId, moduleId, input, req.user!);
	void AuditService.log({
		action: AUDIT_ACTION.COURSE_MODULE_UPDATED,
		description: `Course module "${data.title}" updated`,
		targetType: 'CourseModule',
		targetId: moduleId,
		metadata: { classId, changedFields: Object.keys(input), status: data.status },
		context: extractAuditContext(req),
	});
	res.status(200).json({ status: 'success', data, message: 'Module updated.' });
});

export const removeCourseModule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, moduleId } = moduleParamsSchema.parse(req.params);
	const result = await CourseModuleService.removeCourseModule(classId, moduleId, req.user!);
	if (result.removed) {
		void AuditService.log({
			action: AUDIT_ACTION.COURSE_MODULE_REMOVED,
			description: `Course module "${result.title}" removed`,
			targetType: 'CourseModule',
			targetId: moduleId,
			metadata: { classId },
			context: extractAuditContext(req),
		});
	}
	res.status(200).json({ status: 'success', data: { removed: result.removed } });
});

export const getCourseMaterialUploadUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, moduleId } = moduleParamsSchema.parse(req.params);
	const input = courseMaterialUploadUrlSchema.parse(req.body);
	const data = await CourseModuleService.generateCourseMaterialUploadUrl(classId, moduleId, input, req.user!);
	void AuditService.log({
		action: AUDIT_ACTION.COURSE_MATERIAL_UPLOAD_URL,
		description: 'Private course-material upload authorized',
		targetType: 'CourseModule',
		targetId: moduleId,
		metadata: { classId, contentType: input.contentType, fileSizeBytes: input.fileSizeBytes },
		context: extractAuditContext(req),
	});
	res.status(200).json({ status: 'success', data });
});

export const confirmCourseMaterial = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, moduleId } = moduleParamsSchema.parse(req.params);
	const input = confirmCourseMaterialSchema.parse(req.body);
	const data = await CourseModuleService.confirmCourseMaterial(classId, moduleId, input, req.user!);
	void AuditService.log({
		action: AUDIT_ACTION.COURSE_MATERIAL_ATTACHED,
		description: `Course material "${data.title}" attached`,
		targetType: 'CourseMaterial',
		targetId: data.id,
		metadata: { classId, moduleId, contentType: data.contentType, sizeBytes: data.sizeBytes },
		context: extractAuditContext(req),
	});
	res.status(201).json({ status: 'success', data, message: 'Material attached.' });
});

export const downloadCourseMaterial = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, moduleId, materialId } = materialParamsSchema.parse(req.params);
	const data = await CourseModuleService.getCourseMaterialDownload(
		classId,
		moduleId,
		materialId,
		req.user!,
	);
	void AuditService.log({
		action: AUDIT_ACTION.COURSE_MATERIAL_DOWNLOADED,
		description: 'Course material download authorized',
		targetType: 'CourseMaterial',
		targetId: materialId,
		metadata: { classId, moduleId },
		context: extractAuditContext(req),
	});
	res.status(200).json({ status: 'success', data });
});

export const removeCourseMaterial = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, moduleId, materialId } = materialParamsSchema.parse(req.params);
	const result = await CourseModuleService.removeCourseMaterial(
		classId,
		moduleId,
		materialId,
		req.user!,
	);
	if (result.removed) {
		void AuditService.log({
			action: AUDIT_ACTION.COURSE_MATERIAL_REMOVED,
			description: `Course material "${result.title}" removed`,
			targetType: 'CourseMaterial',
			targetId: materialId,
			metadata: { classId, moduleId },
			context: extractAuditContext(req),
		});
	}
	res.status(200).json({ status: 'success', data: { removed: result.removed } });
});

export const updateCourseMaterial = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { classId, moduleId, materialId } = materialParamsSchema.parse(req.params);
	const input = updateCourseMaterialSchema.parse(req.body);
	const data = await CourseModuleService.updateCourseMaterial(
		classId,
		moduleId,
		materialId,
		input,
		req.user!,
	);
	void AuditService.log({
		action: AUDIT_ACTION.COURSE_MATERIAL_UPDATED,
		description: `Course material "${data.title}" updated`,
		targetType: 'CourseMaterial',
		targetId: materialId,
		metadata: { classId, moduleId, changedFields: Object.keys(input) },
		context: extractAuditContext(req),
	});
	res.status(200).json({ status: 'success', data, message: 'Material updated.' });
});
