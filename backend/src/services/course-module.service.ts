import { CourseModuleStatus, Prisma, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { assertStudentContentAccess } from '@/services/access.service';
import { assertCourseAccess } from '@/services/class.service';
import type { AuthenticatedUser } from '@/types/auth.types';
import type {
	ConfirmCourseMaterialInput,
	CourseMaterialUploadUrlInput,
	CreateCourseModuleInput,
	UpdateCourseModuleInput,
	UpdateCourseMaterialInput,
} from '@/schemas/course-module.schema';
import { AppError } from '@/utils/app-error';
import {
	COURSE_MATERIAL_CONTENT_TYPES,
	COURSE_MATERIAL_KEY_PREFIX,
	COURSE_MATERIAL_MAX_IMAGE_PIXELS,
	COURSE_MATERIAL_MAX_SIZE_BYTES,
	COURSE_MATERIAL_URL_TTL_SECONDS,
} from '@/utils/constants';
import { readImageMetadata } from '@/utils/image-metadata';
import {
	createR2PresignedGetUrl,
	createR2PresignedPutUrl,
	deleteR2Object,
	r2GetObjectBytes,
	r2HeadObject,
} from '@/utils/r2';

const materialSelect = {
	id: true,
	type: true,
	title: true,
	description: true,
	position: true,
	fileName: true,
	contentType: true,
	sizeBytes: true,
	downloadable: true,
	version: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.CourseMaterialSelect;

const moduleSelect = {
	id: true,
	title: true,
	description: true,
	position: true,
	status: true,
	releaseAt: true,
	courseId: true,
	createdAt: true,
	updatedAt: true,
	materials: {
		where: { deletedAt: null },
		select: materialSelect,
		orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
	},
} satisfies Prisma.CourseModuleSelect;

const materialReaderRoles = new Set<Role>([Role.SUPER_ADMIN, Role.TEACHER, Role.STUDENT]);

const assertSupportedReader = (actor: AuthenticatedUser): void => {
	if (!materialReaderRoles.has(actor.role)) {
		throw new AppError('FORBIDDEN', 403, 'Your role cannot access course materials.');
	}
};

const authorizeCourseRead = async (
	classId: string,
	actor: AuthenticatedUser,
	requirePaid: boolean,
): Promise<void> => {
	assertSupportedReader(actor);
	if (actor.role === Role.SUPER_ADMIN) await assertCourseAccess(classId, actor);
	if (actor.role === Role.TEACHER) await assertCourseAccess(classId, actor);
	if (actor.role === Role.STUDENT) {
		await assertStudentContentAccess(actor, classId, { requirePaid });
	}
};

const authorizeCourseManage = async (
	classId: string,
	actor: AuthenticatedUser,
): Promise<void> => {
	if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.TEACHER) {
		throw new AppError('FORBIDDEN', 403, 'Only a teacher or super admin can manage course materials.');
	}
	await assertCourseAccess(classId, actor);
};

const getActiveModule = async (classId: string, moduleId: string) => {
	const module = await prisma.courseModule.findFirst({
		where: { id: moduleId, courseId: classId, deletedAt: null },
	});
	if (!module) throw new AppError('COURSE_MODULE_NOT_FOUND', 404, 'Course module not found.');
	return module;
};

const nextPosition = async (classId: string): Promise<number> => {
	const aggregate = await prisma.courseModule.aggregate({
		where: { courseId: classId, deletedAt: null },
		_max: { position: true },
	});
	return (aggregate._max.position ?? -1) + 1;
};

const nextMaterialPosition = async (moduleId: string): Promise<number> => {
	const aggregate = await prisma.courseMaterial.aggregate({
		where: { moduleId, deletedAt: null },
		_max: { position: true },
	});
	return (aggregate._max.position ?? -1) + 1;
};

export const listCourseModules = async (classId: string, actor: AuthenticatedUser) => {
	await authorizeCourseRead(classId, actor, false);
	const now = new Date();
	return prisma.courseModule.findMany({
		where: {
			courseId: classId,
			deletedAt: null,
			...(actor.role === Role.STUDENT
				? {
						status: CourseModuleStatus.PUBLISHED,
						OR: [{ releaseAt: null }, { releaseAt: { lte: now } }],
					}
				: {}),
		},
		select: moduleSelect,
		orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
	});
};

export const createCourseModule = async (
	classId: string,
	input: CreateCourseModuleInput,
	actor: AuthenticatedUser,
) => {
	await authorizeCourseManage(classId, actor);
	return prisma.courseModule.create({
		data: {
			courseId: classId,
			title: input.title,
			description: input.description ?? null,
			position: input.position ?? await nextPosition(classId),
			status: input.status ?? CourseModuleStatus.DRAFT,
			releaseAt: input.releaseAt ?? null,
		},
		select: moduleSelect,
	});
};

export const updateCourseModule = async (
	classId: string,
	moduleId: string,
	input: UpdateCourseModuleInput,
	actor: AuthenticatedUser,
) => {
	await authorizeCourseManage(classId, actor);
	await getActiveModule(classId, moduleId);
	return prisma.courseModule.update({
		where: { id: moduleId },
		data: {
			title: input.title,
			description: input.description === undefined ? undefined : input.description,
			position: input.position,
			status: input.status,
			releaseAt: input.releaseAt === undefined ? undefined : input.releaseAt,
		},
		select: moduleSelect,
	});
};

const safeDeleteMaterialObject = async (key: string): Promise<void> => {
	try {
		await deleteR2Object(key);
	} catch (error) {
		logger.warn({ err: error, key }, 'Could not clean up a private course material');
	}
};

export const removeCourseModule = async (
	classId: string,
	moduleId: string,
	actor: AuthenticatedUser,
): Promise<{ removed: boolean; title: string }> => {
	await authorizeCourseManage(classId, actor);
	const module = await prisma.courseModule.findFirst({
		where: { id: moduleId, courseId: classId },
		include: { materials: { where: { deletedAt: null }, select: { objectKey: true } } },
	});
	if (!module) throw new AppError('COURSE_MODULE_NOT_FOUND', 404, 'Course module not found.');
	if (module.deletedAt) return { removed: false, title: module.title };

	const deletedAt = new Date();
	await prisma.$transaction([
		prisma.courseMaterial.updateMany({ where: { moduleId, deletedAt: null }, data: { deletedAt } }),
		prisma.courseModule.update({ where: { id: moduleId }, data: { deletedAt } }),
	]);
	await Promise.all(module.materials.flatMap(({ objectKey }) => (
		objectKey ? [safeDeleteMaterialObject(objectKey)] : []
	)));
	return { removed: true, title: module.title };
};

const extensionByContentType: Record<(typeof COURSE_MATERIAL_CONTENT_TYPES)[number], string> = {
	'application/pdf': 'pdf',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
};

export const generateCourseMaterialUploadUrl = async (
	classId: string,
	moduleId: string,
	input: CourseMaterialUploadUrlInput,
	actor: AuthenticatedUser,
) => {
	await authorizeCourseManage(classId, actor);
	await getActiveModule(classId, moduleId);
	const extension = extensionByContentType[input.contentType];
	const key = `${COURSE_MATERIAL_KEY_PREFIX}/${classId}/${moduleId}/${randomUUID()}.${extension}`;
	return {
		uploadUrl: await createR2PresignedPutUrl(key, input.contentType, COURSE_MATERIAL_URL_TTL_SECONDS),
		key,
		expiresAt: new Date(Date.now() + COURSE_MATERIAL_URL_TTL_SECONDS * 1000).toISOString(),
		maxSizeBytes: COURSE_MATERIAL_MAX_SIZE_BYTES,
	};
};

const validateMaterialContent = async (bytes: Uint8Array, contentType: string): Promise<void> => {
	if (contentType === 'application/pdf') {
		const buffer = Buffer.from(bytes);
		const startsCorrectly = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
		const tail = buffer.subarray(Math.max(0, buffer.length - 1024)).toString('latin1');
		if (!startsCorrectly || !tail.includes('%%EOF')) {
			throw new AppError('INVALID_MATERIAL_CONTENT', 422, 'The uploaded file is not a complete PDF.');
		}
		return;
	}
	const metadata = await readImageMetadata(bytes, COURSE_MATERIAL_MAX_IMAGE_PIXELS);
	if (metadata.mimeType !== contentType) {
		throw new AppError('MATERIAL_TYPE_MISMATCH', 422, 'The file content does not match its upload type.');
	}
};

const normalizedFileName = (fileName: string, contentType: string): string => {
	const extension = extensionByContentType[contentType as keyof typeof extensionByContentType];
	const safeBase = fileName
		.replace(/^.*[\\/]/, '')
		.replace(/\.[^.]*$/, '')
		.replace(/[^a-zA-Z0-9 _.-]/g, '_')
		.trim()
		.slice(0, 220) || 'course-material';
	return `${safeBase}.${extension}`;
};

export const confirmCourseMaterial = async (
	classId: string,
	moduleId: string,
	input: ConfirmCourseMaterialInput,
	actor: AuthenticatedUser,
) => {
	await authorizeCourseManage(classId, actor);
	await getActiveModule(classId, moduleId);
	const prefix = `${COURSE_MATERIAL_KEY_PREFIX}/${classId}/${moduleId}/`;
	if (!input.key.startsWith(prefix)) {
		throw new AppError('FORBIDDEN_KEY', 403, 'This upload key does not belong to this module.');
	}
	const existing = await prisma.courseMaterial.findUnique({ where: { objectKey: input.key } });
	if (existing) throw new AppError('MATERIAL_ALREADY_CONFIRMED', 409, 'This upload was already confirmed.');

	const head = await r2HeadObject(input.key);
	if (!head.exists) throw new AppError('UPLOAD_NOT_FOUND', 409, 'The uploaded material was not found.');
	if (!head.size || head.size > COURSE_MATERIAL_MAX_SIZE_BYTES) {
		await safeDeleteMaterialObject(input.key);
		throw new AppError('UPLOAD_TOO_LARGE', 413, 'The material is empty or exceeds the 25 MB limit.');
	}
	if (!head.contentType || !COURSE_MATERIAL_CONTENT_TYPES.includes(
		head.contentType as (typeof COURSE_MATERIAL_CONTENT_TYPES)[number],
	)) {
		await safeDeleteMaterialObject(input.key);
		throw new AppError('INVALID_MATERIAL_TYPE', 422, 'Unsupported stored material type.');
	}
	try {
		const bytes = await r2GetObjectBytes(input.key, COURSE_MATERIAL_MAX_SIZE_BYTES);
		await validateMaterialContent(bytes, head.contentType);
	} catch (error) {
		if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
			await safeDeleteMaterialObject(input.key);
		}
		throw error;
	}

	return prisma.courseMaterial.create({
		data: {
			moduleId,
			title: input.title,
			description: input.description ?? null,
			position: input.position ?? await nextMaterialPosition(moduleId),
			objectKey: input.key,
			fileName: normalizedFileName(input.fileName, head.contentType),
			contentType: head.contentType,
			sizeBytes: head.size,
			downloadable: input.downloadable ?? true,
		},
		select: materialSelect,
	});
};

const getMaterialWithScope = async (classId: string, moduleId: string, materialId: string) => {
	const material = await prisma.courseMaterial.findFirst({
		where: { id: materialId, moduleId, deletedAt: null, module: { courseId: classId, deletedAt: null } },
		include: { module: { select: { title: true, status: true, releaseAt: true, courseId: true } } },
	});
	if (!material) throw new AppError('COURSE_MATERIAL_NOT_FOUND', 404, 'Course material not found.');
	return material;
};

export const getCourseMaterialDownload = async (
	classId: string,
	moduleId: string,
	materialId: string,
	actor: AuthenticatedUser,
) => {
	await authorizeCourseRead(classId, actor, false);
	const material = await getMaterialWithScope(classId, moduleId, materialId);
	if (actor.role === Role.STUDENT) {
		const unreleased = material.module.status !== CourseModuleStatus.PUBLISHED
			|| (material.module.releaseAt && material.module.releaseAt > new Date());
		if (unreleased) throw new AppError('COURSE_MATERIAL_NOT_FOUND', 404, 'Course material not found.');
		await assertStudentContentAccess(actor, classId, { requirePaid: true });
	}
	if (!material.downloadable || !material.objectKey || !material.fileName) {
		throw new AppError('MATERIAL_NOT_DOWNLOADABLE', 403, 'This material is not downloadable.');
	}
	return {
		url: await createR2PresignedGetUrl(
			material.objectKey,
			COURSE_MATERIAL_URL_TTL_SECONDS,
			material.fileName,
		),
		fileName: material.fileName,
		expiresAt: new Date(Date.now() + COURSE_MATERIAL_URL_TTL_SECONDS * 1000).toISOString(),
	};
};

export const removeCourseMaterial = async (
	classId: string,
	moduleId: string,
	materialId: string,
	actor: AuthenticatedUser,
): Promise<{ removed: boolean; title: string }> => {
	await authorizeCourseManage(classId, actor);
	const material = await prisma.courseMaterial.findFirst({
		where: { id: materialId, moduleId, module: { courseId: classId } },
	});
	if (!material) throw new AppError('COURSE_MATERIAL_NOT_FOUND', 404, 'Course material not found.');
	if (material.deletedAt) return { removed: false, title: material.title };
	await prisma.courseMaterial.update({ where: { id: materialId }, data: { deletedAt: new Date() } });
	if (material.objectKey) await safeDeleteMaterialObject(material.objectKey);
	return { removed: true, title: material.title };
};

export const updateCourseMaterial = async (
	classId: string,
	moduleId: string,
	materialId: string,
	input: UpdateCourseMaterialInput,
	actor: AuthenticatedUser,
) => {
	await authorizeCourseManage(classId, actor);
	await getMaterialWithScope(classId, moduleId, materialId);
	return prisma.courseMaterial.update({
		where: { id: materialId },
		data: {
			title: input.title,
			description: input.description === undefined ? undefined : input.description,
			position: input.position,
			downloadable: input.downloadable,
		},
		select: materialSelect,
	});
};
