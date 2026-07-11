import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const { classSessionFindUnique, courseFindUnique, attendanceFindMany, attendanceCount } = vi.hoisted(() => ({
	classSessionFindUnique: vi.fn(),
	courseFindUnique: vi.fn(),
	attendanceFindMany: vi.fn().mockResolvedValue([]),
	attendanceCount: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		classSession: { findUnique: classSessionFindUnique },
		course: { findUnique: courseFindUnique },
		attendance: { findMany: attendanceFindMany, count: attendanceCount },
	},
}));

import { getAttendanceBySession, getAttendanceByCourse } from './attendance.service';

const SUPER_ADMIN = { userId: 'sa-1', role: Role.SUPER_ADMIN };
const ADMIN = { userId: 'fd-1', role: Role.ADMIN };
const owningTeacher = { userId: 'teacher-1', role: Role.TEACHER };
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER };

const session = { id: 'session-1', courseId: 'course-1', deletedAt: null };
const course = { id: 'course-1', teacherId: 'teacher-1' };

beforeEach(() => {
	classSessionFindUnique.mockReset().mockResolvedValue(session);
	courseFindUnique.mockReset().mockResolvedValue(course);
	attendanceFindMany.mockClear();
	attendanceCount.mockClear();
});

describe('getAttendanceBySession — teacher-scoped access', () => {
	it('allows SUPER_ADMIN regardless of course ownership', async () => {
		await expect(getAttendanceBySession('session-1', SUPER_ADMIN)).resolves.toEqual([]);
	});

	it('allows ADMIN (front-desk) regardless of course ownership', async () => {
		await expect(getAttendanceBySession('session-1', ADMIN)).resolves.toEqual([]);
	});

	it('allows the owning TEACHER', async () => {
		await expect(getAttendanceBySession('session-1', owningTeacher)).resolves.toEqual([]);
	});

	it('blocks a TEACHER who does not own the course', async () => {
		await expect(getAttendanceBySession('session-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(attendanceFindMany).not.toHaveBeenCalled();
	});

	it('404s for a missing session before the ownership check runs', async () => {
		classSessionFindUnique.mockResolvedValueOnce(null);
		await expect(getAttendanceBySession('missing', otherTeacher)).rejects.toMatchObject({
			code: 'CLASS_SESSION_NOT_FOUND',
			statusCode: 404,
		});
	});

	it('404s for a soft-deleted session', async () => {
		classSessionFindUnique.mockResolvedValueOnce({ ...session, deletedAt: new Date() });
		await expect(getAttendanceBySession('session-1', SUPER_ADMIN)).rejects.toMatchObject({
			code: 'CLASS_SESSION_NOT_FOUND',
		});
	});
});

describe('getAttendanceByCourse — teacher-scoped access', () => {
	const query = { page: 1, limit: 20 };

	it('allows SUPER_ADMIN regardless of course ownership', async () => {
		await expect(getAttendanceByCourse('course-1', query, SUPER_ADMIN)).resolves.toEqual({
			records: [],
			total: 0,
		});
	});

	it('allows the owning TEACHER', async () => {
		await expect(getAttendanceByCourse('course-1', query, owningTeacher)).resolves.toEqual({
			records: [],
			total: 0,
		});
	});

	it('blocks a TEACHER who does not own the course', async () => {
		await expect(getAttendanceByCourse('course-1', query, otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(attendanceFindMany).not.toHaveBeenCalled();
	});

	it('404s for a missing course before the ownership check runs', async () => {
		courseFindUnique.mockResolvedValueOnce(null);
		await expect(getAttendanceByCourse('missing', query, otherTeacher)).rejects.toMatchObject({
			code: 'CLASS_NOT_FOUND',
			statusCode: 404,
		});
	});
});
