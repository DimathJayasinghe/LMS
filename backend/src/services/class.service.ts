import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import type {
	CreateClassInput,
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
	backdropUrl: string | null;
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
	backdropUrl: true,
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
			bannerUrl: input.bannerUrl ?? null,
			backdropUrl: input.backdropUrl ?? null,
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
	backdropUrl: string | null;
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
	backdropUrl: true,
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
			bannerUrl: input.bannerUrl ?? undefined,
			backdropUrl: input.backdropUrl ?? undefined,
		},
		select: classSelect,
	});
};
