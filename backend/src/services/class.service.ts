import { Prisma, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { AppError } from '@/utils/app-error';
import { readImageMetadata } from '@/utils/image-metadata';
import {
	createR2PresignedPutUrl,
	deleteR2Object,
	getPublicAssetConfig,
	r2GetObjectBytes,
	r2HeadObject,
} from '@/utils/r2';
import {
	COURSE_ASSET_CONTENT_TYPES,
	COURSE_ASSET_MAX_SIZE_BYTES,
	COURSE_ASSET_REQUIREMENTS,
	COURSE_ASSET_URL_TTL_SECONDS,
} from '@/utils/constants';
import type { AuthenticatedUser } from '@/types/auth.types';
import type {
	CreateClassInput,
	CourseAssetConfirmInput,
	CourseAssetAltInput,
	CourseAssetKind,
	CourseAssetUploadUrlInput,
	ListClassesQuery,
	ListPublicClassesQuery,
	UpdateClassInput,
} from '@/schemas/class.schema';

interface ClassSummary {
	id: string;
	name: string;
	year: number;
	description: string | null;
	monthlyFee: Prisma.Decimal;
	isActive: boolean;
	subjectId: string;
	teacherId: string;
	bannerUrl: string | null;
	bannerAlt: string | null;
	backdropUrl: string | null;
	backdropAlt: string | null;
	createdAt: Date;
	updatedAt: Date;
}

const classSelect = {
	id: true,
	name: true,
	year: true,
	description: true,
	monthlyFee: true,
	isActive: true,
	subjectId: true,
	teacherId: true,
	bannerUrl: true,
	bannerAlt: true,
	backdropUrl: true,
	backdropAlt: true,
	createdAt: true,
	updatedAt: true,
} satisfies Prisma.CourseSelect;

const buildSearchFilter = (search: string): Prisma.CourseWhereInput => {
	return {
		OR: [
			{ name: { contains: search, mode: 'insensitive' } },
			{ description: { contains: search, mode: 'insensitive' } },
		],
	};
};

/**
 * Authorization gate for course-scoped mutations (sessions, exams, videos).
 * SUPER_ADMIN may touch any course; a TEACHER may touch ONLY courses they own.
 * Returns the course's owner info so callers can reuse it. Throws 404/403.
 *
 * Reused by class-session / exam / video services so teacher ownership is
 * enforced in exactly one place (Single Responsibility — see 10-maintenance-guide).
 */
export const assertCourseAccess = async (
	courseId: string,
	actor: AuthenticatedUser,
): Promise<{ id: string; teacherId: string }> => {
	const course = await prisma.course.findUnique({
		where: { id: courseId },
		select: { id: true, teacherId: true },
	});

	if (!course) {
		throw new AppError('CLASS_NOT_FOUND', 404, 'Class (course) not found.');
	}

	if (actor.role === Role.TEACHER && course.teacherId !== actor.userId) {
		throw new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');
	}

	return course;
};

/** Validates that a user exists and is a TEACHER (used when assigning course ownership). */
const assertTeacherExists = async (teacherId: string): Promise<void> => {
	const teacher = await prisma.user.findFirst({
		where: { id: teacherId, role: Role.TEACHER, deletedAt: null },
		select: { id: true },
	});
	if (!teacher) {
		throw new AppError('INVALID_TEACHER', 400, 'Assigned teacher must be an active TEACHER.');
	}
};

/** Validates that the subject exists. */
const assertSubjectExists = async (subjectId: string): Promise<void> => {
	const subject = await prisma.subject.findUnique({
		where: { id: subjectId },
		select: { id: true },
	});
	if (!subject) {
		throw new AppError('SUBJECT_NOT_FOUND', 404, 'Subject not found.');
	}
};

const assertTeacherAssignedToSubject = async (
	subjectId: string,
	teacherId: string,
): Promise<void> => {
	const assignment = await prisma.subjectTeacher.findUnique({
		where: { subjectId_teacherId: { subjectId, teacherId } },
		select: { id: true },
	});
	if (!assignment) {
		throw new AppError(
			'TEACHER_NOT_ASSIGNED_TO_SUBJECT',
			403,
			'The super admin must assign this teacher to the subject first.',
		);
	}
};

export const createClass = async (
	input: CreateClassInput,
	actor: AuthenticatedUser,
): Promise<ClassSummary> => {
	// A TEACHER always owns the courses they create; a SUPER_ADMIN must name the teacher.
	const teacherId = actor.role === Role.TEACHER ? actor.userId : input.teacherId;
	if (!teacherId) {
		throw new AppError('TEACHER_REQUIRED', 400, 'A teacher must be assigned to the course.');
	}

	await assertSubjectExists(input.subjectId);
	await assertTeacherExists(teacherId);
	await assertTeacherAssignedToSubject(input.subjectId, teacherId);

	const existing = await prisma.course.findUnique({
		where: {
			subjectId_name_year: {
				subjectId: input.subjectId,
				name: input.name,
				year: input.year,
			},
		},
	});

	if (existing) {
		throw new AppError(
			'CLASS_ALREADY_EXISTS',
			409,
			'A class with this name and year already exists for this subject.',
		);
	}

	return prisma.course.create({
		data: {
			name: input.name,
			year: input.year,
			description: input.description ?? null,
			monthlyFee: input.monthlyFee,
			isActive: input.isActive ?? true,
			subjectId: input.subjectId,
			teacherId,
		},
		select: classSelect,
	});
};

interface PublicClassSummary {
	id: string;
	name: string;
	year: number;
	description: string | null;
	monthlyFee: Prisma.Decimal;
	bannerUrl: string | null;
	bannerAlt: string | null;
	backdropUrl: string | null;
	backdropAlt: string | null;
	subject: { name: string };
	teacher: { name: string };
}

const publicClassSelect = {
	id: true,
	name: true,
	year: true,
	description: true,
	monthlyFee: true,
	bannerUrl: true,
	bannerAlt: true,
	backdropUrl: true,
	backdropAlt: true,
	subject: { select: { name: true } },
	teacher: { select: { name: true } },
} satisfies Prisma.CourseSelect;

/**
 * Marketing-page listing — no auth, so no email/phone/NIC/enrollment counts,
 * just what a prospective student needs to decide whether to sign up. Active
 * courses only (soft-disabled courses never appear pre-login).
 */
export const listPublicClasses = async (
	query: ListPublicClassesQuery,
): Promise<PublicClassSummary[]> => {
	const where: Prisma.CourseWhereInput = {
		...(query.search ? buildSearchFilter(query.search) : {}),
		...(query.year ? { year: query.year } : {}),
		isActive: true,
	};

	return prisma.course.findMany({
		where,
		select: publicClassSelect,
		orderBy: { year: 'desc' },
	});
};

export const listClasses = async (
	query: ListClassesQuery,
	actor: AuthenticatedUser,
): Promise<ClassSummary[]> => {
	const where: Prisma.CourseWhereInput = {
		...(query.search ? buildSearchFilter(query.search) : {}),
		...(query.year ? { year: query.year } : {}),
		// Only the owner sees inactive courses; everyone else sees active only.
		...(actor.role === Role.SUPER_ADMIN ? {} : { isActive: true }),
		...(actor.role === Role.TEACHER ? { teacherId: actor.userId } : {}),
	};

	return prisma.course.findMany({
		where,
		select: classSelect,
		orderBy: { year: 'desc' },
	});
};

export const getClassById = async (
	classId: string,
	actor: AuthenticatedUser,
): Promise<ClassSummary> => {
	const where: Prisma.CourseWhereInput = {
		id: classId,
		...(actor.role === Role.SUPER_ADMIN ? {} : { isActive: true }),
	};

	const course = await prisma.course.findFirst({
		where,
		select: classSelect,
	});

	if (!course) {
		throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
	}
	if (actor.role === Role.TEACHER && course.teacherId !== actor.userId) {
		throw new AppError('FORBIDDEN_COURSE', 403, 'You can only view your own courses.');
	}

	return course;
};

export const updateClass = async (
	classId: string,
	input: UpdateClassInput,
	actor: AuthenticatedUser,
): Promise<ClassSummary> => {
	const existing = await prisma.course.findUnique({ where: { id: classId } });

	if (!existing) {
		throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
	}

	// Teachers may only edit their own courses.
	if (actor.role === Role.TEACHER && existing.teacherId !== actor.userId) {
		throw new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');
	}

	// Only a SUPER_ADMIN may reassign the owning teacher or the subject.
	let nextTeacherId = existing.teacherId;
	let nextSubjectId = existing.subjectId;
	if (actor.role === Role.SUPER_ADMIN) {
		if (input.teacherId && input.teacherId !== existing.teacherId) {
			await assertTeacherExists(input.teacherId);
			nextTeacherId = input.teacherId;
		}
		if (input.subjectId && input.subjectId !== existing.subjectId) {
			await assertSubjectExists(input.subjectId);
			nextSubjectId = input.subjectId;
		}
	}

	if (nextTeacherId !== existing.teacherId || nextSubjectId !== existing.subjectId) {
		await assertTeacherAssignedToSubject(nextSubjectId, nextTeacherId);
	}

	const nextName = input.name ?? existing.name;
	const nextYear = input.year ?? existing.year;

	const duplicate = await prisma.course.findUnique({
		where: {
			subjectId_name_year: {
				subjectId: nextSubjectId,
				name: nextName,
				year: nextYear,
			},
		},
	});

	if (duplicate && duplicate.id !== classId) {
		throw new AppError(
			'CLASS_ALREADY_EXISTS',
			409,
			'A class with this name and year already exists for this subject.',
		);
	}

	return prisma.course.update({
		where: { id: classId },
		data: {
			name: input.name,
			year: input.year,
			description: input.description ?? undefined,
			monthlyFee: input.monthlyFee,
			isActive: input.isActive,
			subjectId: nextSubjectId,
			teacherId: nextTeacherId,
		},
		select: classSelect,
	});
};

const assertCourseAssetManager = async (
	classId: string,
	actor: AuthenticatedUser,
): Promise<void> => {
	if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.TEACHER) {
		throw new AppError('FORBIDDEN', 403, 'Only a teacher or super admin can manage class images.');
	}
	await assertCourseAccess(classId, actor);
};

const extensionByContentType: Record<(typeof COURSE_ASSET_CONTENT_TYPES)[number], string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
};

const safeDeletePublicAsset = async (key: string): Promise<void> => {
	try {
		const { bucket } = getPublicAssetConfig();
		await deleteR2Object(key, bucket);
	} catch (error) {
		logger.warn({ err: error, key }, 'Could not clean up a course display asset');
	}
};

export const generateCourseAssetUploadUrl = async (
	classId: string,
	input: CourseAssetUploadUrlInput,
	actor: AuthenticatedUser,
) => {
	await assertCourseAssetManager(classId, actor);
	const requirement = COURSE_ASSET_REQUIREMENTS[input.kind];
	const extension = extensionByContentType[input.contentType];
	const key = `courses/${classId}/${requirement.path}/${randomUUID()}.${extension}`;
	const { bucket } = getPublicAssetConfig();
	const uploadUrl = await createR2PresignedPutUrl(
		key,
		input.contentType,
		COURSE_ASSET_URL_TTL_SECONDS,
		bucket,
	);

	return {
		uploadUrl,
		key,
		expiresAt: new Date(Date.now() + COURSE_ASSET_URL_TTL_SECONDS * 1000).toISOString(),
		requiredWidth: requirement.width,
		requiredHeight: requirement.height,
		maxSizeBytes: COURSE_ASSET_MAX_SIZE_BYTES,
	};
};

const loadCourseAssetState = async (classId: string) => {
	const course = await prisma.course.findUnique({
		where: { id: classId },
		select: {
			id: true,
			name: true,
			bannerKey: true,
			bannerUrl: true,
			backdropKey: true,
			backdropUrl: true,
		},
	});
	if (!course) throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
	return course;
};

const loadClassSummary = async (classId: string): Promise<ClassSummary> => {
	const course = await prisma.course.findUnique({ where: { id: classId }, select: classSelect });
	if (!course) throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
	return course;
};

export const confirmCourseAsset = async (
	classId: string,
	input: CourseAssetConfirmInput,
	actor: AuthenticatedUser,
): Promise<ClassSummary> => {
	await assertCourseAssetManager(classId, actor);
	const requirement = COURSE_ASSET_REQUIREMENTS[input.kind];
	const requiredPrefix = `courses/${classId}/${requirement.path}/`;
	if (!input.key.startsWith(requiredPrefix)) {
		throw new AppError('FORBIDDEN_KEY', 403, 'This upload key does not belong to this class.');
	}

	const { bucket, publicBaseUrl } = getPublicAssetConfig();
	const head = await r2HeadObject(input.key, bucket);
	if (!head.exists) {
		throw new AppError('UPLOAD_NOT_FOUND', 409, 'The uploaded image was not found. Please re-upload.');
	}
	if (!head.size || head.size > COURSE_ASSET_MAX_SIZE_BYTES) {
		await safeDeletePublicAsset(input.key);
		throw new AppError('UPLOAD_TOO_LARGE', 413, 'The uploaded image is empty or exceeds the 8 MB limit.');
	}
	if (!head.contentType || !COURSE_ASSET_CONTENT_TYPES.includes(
		head.contentType as (typeof COURSE_ASSET_CONTENT_TYPES)[number],
	)) {
		await safeDeletePublicAsset(input.key);
		throw new AppError('INVALID_IMAGE_TYPE', 422, 'The stored object is not a JPG, PNG, or WebP image.');
	}

	let metadata;
	try {
		const bytes = await r2GetObjectBytes(input.key, COURSE_ASSET_MAX_SIZE_BYTES, bucket);
		metadata = await readImageMetadata(bytes);
	} catch (error) {
		if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
			await safeDeletePublicAsset(input.key);
		}
		throw error;
	}
	if (metadata.mimeType !== head.contentType) {
		await safeDeletePublicAsset(input.key);
		throw new AppError('IMAGE_TYPE_MISMATCH', 422, 'The image content does not match its upload type.');
	}
	if (metadata.width !== requirement.width || metadata.height !== requirement.height) {
		await safeDeletePublicAsset(input.key);
		throw new AppError(
			'INVALID_IMAGE_DIMENSIONS',
			422,
			`${input.kind === 'BANNER' ? 'Banner' : 'Backdrop'} must be exactly ${requirement.width}×${requirement.height} pixels; received ${metadata.width}×${metadata.height}.`,
		);
	}

	const course = await loadCourseAssetState(classId);
	const assetUrl = `${publicBaseUrl}/${input.key}`;
	const altText = input.altText ?? `${course.name} ${requirement.path}`;
	const oldKey = input.kind === 'BANNER' ? course.bannerKey : course.backdropKey;
	const data = input.kind === 'BANNER'
		? { bannerKey: input.key, bannerUrl: assetUrl, bannerAlt: altText }
		: { backdropKey: input.key, backdropUrl: assetUrl, backdropAlt: altText };
	const where: Prisma.CourseWhereInput = input.kind === 'BANNER'
		? { id: classId, bannerKey: course.bannerKey, bannerUrl: course.bannerUrl }
		: { id: classId, backdropKey: course.backdropKey, backdropUrl: course.backdropUrl };
	const write = await prisma.course.updateMany({ where, data });
	if (write.count !== 1) {
		await safeDeletePublicAsset(input.key);
		throw new AppError(
			'COURSE_ASSET_CHANGED',
			409,
			'This class image changed while your upload was being confirmed. Refresh and try again.',
		);
	}
	const updated = await loadClassSummary(classId);
	if (oldKey && oldKey !== input.key) await safeDeletePublicAsset(oldKey);
	return updated;
};

export const removeCourseAsset = async (
	classId: string,
	kind: CourseAssetKind,
	actor: AuthenticatedUser,
): Promise<{ course: ClassSummary; removed: boolean }> => {
	await assertCourseAssetManager(classId, actor);
	const current = await loadCourseAssetState(classId);
	const oldKey = kind === 'BANNER' ? current.bannerKey : current.backdropKey;
	const oldUrl = kind === 'BANNER' ? current.bannerUrl : current.backdropUrl;
	if (!oldKey && !oldUrl) return { course: await loadClassSummary(classId), removed: false };
	const data = kind === 'BANNER'
		? { bannerKey: null, bannerUrl: null, bannerAlt: null }
		: { backdropKey: null, backdropUrl: null, backdropAlt: null };
	const where: Prisma.CourseWhereInput = kind === 'BANNER'
		? { id: classId, bannerKey: oldKey, bannerUrl: oldUrl }
		: { id: classId, backdropKey: oldKey, backdropUrl: oldUrl };
	const write = await prisma.course.updateMany({ where, data });
	if (write.count !== 1) {
		throw new AppError('COURSE_ASSET_CHANGED', 409, 'This class image changed. Refresh and try again.');
	}
	const course = await loadClassSummary(classId);
	if (oldKey) await safeDeletePublicAsset(oldKey);
	return { course, removed: Boolean(oldKey || oldUrl) };
};

export const updateCourseAssetAlt = async (
	classId: string,
	kind: CourseAssetKind,
	input: CourseAssetAltInput,
	actor: AuthenticatedUser,
): Promise<ClassSummary> => {
	await assertCourseAssetManager(classId, actor);
	const current = await loadCourseAssetState(classId);
	const currentUrl = kind === 'BANNER' ? current.bannerUrl : current.backdropUrl;
	if (!currentUrl) {
		throw new AppError('COURSE_ASSET_NOT_FOUND', 409, 'Upload the class image before describing it.');
	}
	const currentKey = kind === 'BANNER' ? current.bannerKey : current.backdropKey;
	const data = kind === 'BANNER'
		? { bannerAlt: input.altText }
		: { backdropAlt: input.altText };
	const where: Prisma.CourseWhereInput = kind === 'BANNER'
		? { id: classId, bannerKey: currentKey, bannerUrl: currentUrl }
		: { id: classId, backdropKey: currentKey, backdropUrl: currentUrl };
	const write = await prisma.course.updateMany({ where, data });
	if (write.count !== 1) {
		throw new AppError('COURSE_ASSET_CHANGED', 409, 'This class image changed. Refresh and try again.');
	}
	return loadClassSummary(classId);
};
