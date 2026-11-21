// Enrollment service — the single place a STUDENT's link to a course is created,
// listed, and cancelled. Payments and content-access (see access.service) both
// hang off an *active* enrollment, so this is the entry point to the paid flow.
//
// A STUDENT self-enrolls (into an active course); an ADMIN/SUPER_ADMIN may enroll
// a specific student at the front desk. Uniqueness is per (user, course, mode) —
// re-enrolling a previously cancelled row reactivates it instead of duplicating.

import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';
import type {
	CreateEnrollmentInput,
	ListEnrollmentsQuery,
	ListMyEnrollmentsQuery,
} from '@/schemas/enrollment.schema';

const enrollmentSelect = {
	id: true,
	classType: true,
	isActive: true,
	userId: true,
	courseId: true,
	createdAt: true,
	updatedAt: true,
	course: {
		select: {
			id: true,
			name: true,
			year: true,
			monthlyFee: true,
			bannerUrl: true,
			isActive: true,
			subjectId: true,
			teacherId: true,
		},
	},
} satisfies Prisma.EnrollmentSelect;

/** Resolve the student being enrolled: a STUDENT enrolls themselves; staff pass a userId. */
const resolveTargetUserId = async (
	input: CreateEnrollmentInput,
	actor: AuthenticatedUser,
): Promise<string> => {
	if (actor.role === Role.STUDENT) return actor.userId;

	if (!input.userId) {
		throw new AppError('USER_ID_REQUIRED', 400, 'A userId is required when enrolling a student.');
	}

	const target = await prisma.user.findFirst({
		where: { id: input.userId, deletedAt: null },
		select: { id: true, role: true },
	});
	if (!target) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}
	if (target.role !== Role.STUDENT) {
		throw new AppError('NOT_A_STUDENT', 400, 'Only students can be enrolled in a course.');
	}
	return target.id;
};

export const createEnrollment = async (
	input: CreateEnrollmentInput,
	actor: AuthenticatedUser,
) => {
	const userId = await resolveTargetUserId(input, actor);

	// The course must exist and be active to enroll into.
	const course = await prisma.course.findFirst({
		where: { id: input.courseId, isActive: true },
		select: { id: true },
	});
	if (!course) {
		throw new AppError('CLASS_NOT_FOUND', 404, 'Class not found.');
	}

	const existing = await prisma.enrollment.findUnique({
		where: {
			userId_courseId_classType: {
				userId,
				courseId: input.courseId,
				classType: input.classType,
			},
		},
		select: { id: true, isActive: true },
	});

	if (existing?.isActive) {
		throw new AppError('ALREADY_ENROLLED', 409, 'Already enrolled in this class.');
	}

	// Reactivate a previously cancelled enrollment rather than creating a duplicate.
	if (existing) {
		return prisma.enrollment.update({
			where: { id: existing.id },
			data: { isActive: true },
			select: enrollmentSelect,
		});
	}

	return prisma.enrollment.create({
		data: {
			userId,
			courseId: input.courseId,
			classType: input.classType,
		},
		select: enrollmentSelect,
	});
};

export const listMyEnrollments = async (
	actor: AuthenticatedUser,
	query: ListMyEnrollmentsQuery,
) => {
	const where: Prisma.EnrollmentWhereInput = {
		userId: actor.userId,
		...(query.courseId ? { courseId: query.courseId } : {}),
		...(query.classType ? { classType: query.classType } : {}),
		...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
	};

	return prisma.enrollment.findMany({
		where,
		select: enrollmentSelect,
		orderBy: { createdAt: 'desc' },
	});
};

export const listMyLearningCourses = async (userId: string) => {
	const enrollments = await prisma.enrollment.findMany({
		where: { userId, isActive: true, course: { isActive: true } },
		select: enrollmentSelect,
		orderBy: { createdAt: 'desc' },
		take: 50,
	});

	if (enrollments.length === 0) return [];

	const courseIds = Array.from(new Set(enrollments.map((enrollment) => enrollment.courseId)));
	const [progressRows, sessions] = await Promise.all([
		prisma.courseContentProgress.findMany({
			where: { userId, courseId: { in: courseIds } },
			select: { courseId: true, lastSeenAt: true },
		}),
		prisma.classSession.findMany({
			where: { courseId: { in: courseIds }, deletedAt: null },
			select: {
				courseId: true,
				date: true,
				videoRecordings: {
					where: { status: 'READY' },
					select: { createdAt: true },
				},
			},
		}),
	]);

	const lastSeenByCourse = new Map(progressRows.map((row) => [row.courseId, row.lastSeenAt]));
	const now = new Date();

	return enrollments.map((enrollment) => {
		const lastSeenAt = lastSeenByCourse.get(enrollment.courseId) ?? enrollment.createdAt;
		const courseSessions = sessions.filter((session) => session.courseId === enrollment.courseId);
		const recordings = courseSessions.flatMap((session) => session.videoRecordings);
		const upcoming = courseSessions
			.map((session) => session.date)
			.filter((date) => date >= now)
			.sort((a, b) => a.getTime() - b.getTime());
		const newestRecording = recordings
			.map((recording) => recording.createdAt)
			.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

		return {
			...enrollment,
			learning: {
				newLessonCount: recordings.filter((recording) => recording.createdAt > lastSeenAt).length,
				latestLessonAt: newestRecording,
				upcomingSessionCount: upcoming.length,
				nextSessionAt: upcoming[0] ?? null,
				lastSeenAt,
			},
		};
	});
};

export const markCourseContentSeen = async (userId: string, courseId: string) => {
	const enrollment = await prisma.enrollment.findFirst({
		where: { userId, courseId, isActive: true, course: { isActive: true } },
		select: { id: true },
	});
	if (!enrollment) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Active enrollment not found.');
	}

	return prisma.courseContentProgress.upsert({
		where: { userId_courseId: { userId, courseId } },
		create: { userId, courseId },
		update: { lastSeenAt: new Date() },
		select: { courseId: true, lastSeenAt: true },
	});
};

export const listEnrollments = async (query: ListEnrollmentsQuery) => {
	const where: Prisma.EnrollmentWhereInput = {
		...(query.userId ? { userId: query.userId } : {}),
		...(query.courseId ? { courseId: query.courseId } : {}),
		...(query.classType ? { classType: query.classType } : {}),
		...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
	};

	const [items, total] = await Promise.all([
		prisma.enrollment.findMany({
			where,
			select: {
				...enrollmentSelect,
				user: { select: { id: true, name: true, indexNumber: true, email: true } },
			},
			orderBy: { createdAt: 'desc' },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.enrollment.count({ where }),
	]);

	return { items, total };
};

export const getEnrollmentById = async (id: string, actor: AuthenticatedUser) => {
	const enrollment = await prisma.enrollment.findUnique({
		where: { id },
		select: enrollmentSelect,
	});
	if (!enrollment) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
	}

	// A student may only see their own enrollments.
	if (actor.role === Role.STUDENT && enrollment.userId !== actor.userId) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
	}

	return enrollment;
};

/** Soft-cancel (set inactive). Content access and new payments stop; history is kept. */
export const cancelEnrollment = async (id: string, actor: AuthenticatedUser) => {
	const enrollment = await prisma.enrollment.findUnique({
		where: { id },
		select: { id: true, userId: true, isActive: true },
	});
	if (!enrollment) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
	}
	if (actor.role === Role.STUDENT && enrollment.userId !== actor.userId) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
	}

	return prisma.enrollment.update({
		where: { id },
		data: { isActive: false },
		select: enrollmentSelect,
	});
};
