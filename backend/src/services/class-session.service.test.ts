import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	courseFindUnique,
	classSessionFindMany,
	classSessionFindUnique,
	assertStudentContentAccess,
	assertCourseAccess,
} = vi.hoisted(() => ({
	courseFindUnique: vi.fn(),
	classSessionFindMany: vi.fn(),
	classSessionFindUnique: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		course: { findUnique: courseFindUnique },
		classSession: { findMany: classSessionFindMany, findUnique: classSessionFindUnique },
	},
}));

vi.mock('@/services/access.service', () => ({ assertStudentContentAccess }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({}));

import { listClassSessions, getClassSessionById } from './class-session.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER } as const;
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER } as const;
const superAdmin = { userId: 'admin-1', role: Role.SUPER_ADMIN } as const;
const forbidden = new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');

const sessionRow = {
	id: 'sess-1',
	title: 'Session 1',
	description: null,
	classType: 'PHYSICAL',
	date: new Date('2026-07-01T00:00:00.000Z'),
	durationMinutes: 60,
	zoomLink: null,
	zoomMeetingId: null,
	courseId: 'course-1',
	deletedAt: null,
	createdAt: new Date('2026-06-01T00:00:00.000Z'),
	updatedAt: new Date('2026-06-01T00:00:00.000Z'),
};

beforeEach(() => {
	vi.clearAllMocks();
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	courseFindUnique.mockResolvedValue({ id: 'course-1' });
});

describe('listClassSessions — TEACHER course-ownership scoping', () => {
	it('calls assertCourseAccess with the classId and acting TEACHER', async () => {
		classSessionFindMany.mockResolvedValueOnce([]);

		await listClassSessions('course-1', {}, teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE, never querying sessions', async () => {
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(listClassSessions('course-1', {}, otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(classSessionFindMany).not.toHaveBeenCalled();
	});

	it("SUPER_ADMIN lists any course's sessions unaffected", async () => {
		classSessionFindMany.mockResolvedValueOnce([sessionRow]);

		const result = await listClassSessions('course-1', {}, superAdmin);

		expect(result).toEqual([sessionRow]);
		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', superAdmin);
	});
});

describe('getClassSessionById — TEACHER course-ownership scoping', () => {
	it('calls assertCourseAccess with the classId and acting TEACHER', async () => {
		classSessionFindUnique.mockResolvedValueOnce(sessionRow);

		await getClassSessionById('course-1', 'sess-1', teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE, never querying the session', async () => {
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(getClassSessionById('course-1', 'sess-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(classSessionFindUnique).not.toHaveBeenCalled();
	});
});
