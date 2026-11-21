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
const student = { userId: 'student-1', role: Role.STUDENT } as const;
const marker = { userId: 'marker-1', role: Role.MARKER } as const;
const forbidden = new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');

const sessionRow = {
	id: 'sess-1',
	title: 'Session 1',
	description: null,
	classType: 'PHYSICAL',
	date: new Date('2026-07-01T00:00:00.000Z'),
	durationMinutes: 60,
	zoomMeetingId: null,
	courseId: 'course-1',
	deletedAt: null,
	createdAt: new Date('2026-06-01T00:00:00.000Z'),
	updatedAt: new Date('2026-06-01T00:00:00.000Z'),
	_count: { videoRecordings: 0 },
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

		const { _count, ...publicFields } = sessionRow;
		void _count;
		expect(result).toEqual([{ ...publicFields, liveScheduled: false, hasRecording: false }]);
		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', superAdmin);
	});

	it('redacts the provider meeting number from students while exposing scheduled state', async () => {
		classSessionFindMany.mockResolvedValueOnce([{ ...sessionRow, zoomMeetingId: 'provider-secret' }]);
		const result = await listClassSessions('course-1', {}, student);
		expect(result[0]).toMatchObject({ zoomMeetingId: null, liveScheduled: true });
	});

	it('denies markers before querying course or session data', async () => {
		await expect(listClassSessions('course-1', {}, marker)).rejects.toMatchObject({
			code: 'FORBIDDEN', statusCode: 403,
		});
		expect(classSessionFindMany).not.toHaveBeenCalled();
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

describe('hasRecording flag', () => {
	const rowWith = (ready: number) => ({ ...sessionRow, _count: { videoRecordings: ready } });

	it.each([
		['owner', superAdmin],
		['owning teacher', teacher],
		['student', student],
	])('%s: true when a ready recording exists, and the raw count is not exposed', async (_n, actor) => {
		classSessionFindMany.mockResolvedValueOnce([rowWith(2)]);
		const [result] = await listClassSessions('course-1', { page: 1, limit: 20 } as never, actor);

		expect(result).toMatchObject({ id: 'sess-1', hasRecording: true });
		expect(result).not.toHaveProperty('_count');
	});

	it('false when there is no ready recording', async () => {
		classSessionFindMany.mockResolvedValueOnce([rowWith(0)]);
		const [result] = await listClassSessions('course-1', { page: 1, limit: 20 } as never, superAdmin);
		expect(result).toMatchObject({ hasRecording: false });
	});

	it('counts only READY recordings (the select filters on status)', async () => {
		classSessionFindMany.mockResolvedValueOnce([rowWith(1)]);
		await listClassSessions('course-1', { page: 1, limit: 20 } as never, superAdmin);

		const select = classSessionFindMany.mock.calls[0]![0].select;
		expect(select._count).toEqual({ select: { videoRecordings: { where: { status: 'READY' } } } });
	});

	it('getClassSessionById carries the flag too', async () => {
		classSessionFindUnique.mockResolvedValueOnce({ ...rowWith(1), deletedAt: null });
		const result = await getClassSessionById('course-1', 'sess-1', teacher);
		expect(result).toMatchObject({ hasRecording: true });
		expect(result).not.toHaveProperty('_count');
	});
});
