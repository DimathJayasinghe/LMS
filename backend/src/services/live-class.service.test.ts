import { ClassType, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findSession: vi.fn(),
	findUser: vi.fn(),
	updateSession: vi.fn(),
	createMeeting: vi.fn(),
	redisSet: vi.fn(),
	assertCourseAccess: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	generateSignature: vi.fn(),
	getZak: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		classSession: { findUnique: mocks.findSession, update: mocks.updateSession },
		user: { findUnique: mocks.findUser },
	},
}));
vi.mock('@/config/redis', () => ({ redis: { set: mocks.redisSet } }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess: mocks.assertCourseAccess }));
vi.mock('@/services/access.service', () => ({ assertStudentContentAccess: mocks.assertStudentContentAccess }));
vi.mock('@/utils/zoom', () => ({
	createZoomMeeting: mocks.createMeeting,
	generateMeetingSdkSignature: mocks.generateSignature,
	getZoomHostZak: mocks.getZak,
}));

import { issueLiveClassToken, scheduleLiveClass } from './live-class.service';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findSession.mockResolvedValue({
		id: 'session-1', title: 'Live lesson', classType: ClassType.ONLINE,
		date: new Date(), durationMinutes: 60, courseId: 'course-1',
		zoomMeetingId: 'meeting-secret', zoomLink: 'https://zoom.invalid/j/1',
		zoomPassword: 'password-secret', deletedAt: null,
	});
	mocks.redisSet.mockResolvedValue('OK');
	mocks.findUser.mockResolvedValue({ name: 'Student One', indexNumber: 42 });
	mocks.generateSignature.mockReturnValue({ signature: 'sdk-token', sdkKey: 'sdk-key', expiresAt: 123 });
	mocks.getZak.mockResolvedValue('zak');
});

describe('live-class token role boundaries', () => {
	it.each([Role.ADMIN, Role.MARKER])('rejects %s before token throttling or credential work', async (role) => {
		await expect(issueLiveClassToken('session-1', { userId: 'user-1', role })).rejects.toMatchObject({
			code: 'FORBIDDEN', statusCode: 403,
		});
		expect(mocks.redisSet).not.toHaveBeenCalled();
		expect(mocks.assertStudentContentAccess).not.toHaveBeenCalled();
	});

	it('requires enrollment and current payment for a student token', async () => {
		const actor = { userId: 'student-1', role: Role.STUDENT };
		await issueLiveClassToken('session-1', actor);
		expect(mocks.assertStudentContentAccess).toHaveBeenCalledWith(actor, 'course-1', { requirePaid: true });
		expect(mocks.assertCourseAccess).not.toHaveBeenCalled();
	});

	it('gives only an owning teacher or super admin the host path', async () => {
		const actor = { userId: 'teacher-1', role: Role.TEACHER };
		const result = await issueLiveClassToken('session-1', actor);
		expect(mocks.assertCourseAccess).toHaveBeenCalledWith('course-1', actor);
		expect(result.role).toBe(1);
		expect(result.zak).toBe('zak');
	});
});


describe('scheduleLiveClass session modes', () => {
	const actor = { userId: 'teacher-1', role: Role.TEACHER } as const;
	it.each([ClassType.ONLINE, null])('schedules mode %s', async (classType) => {
		mocks.findSession.mockResolvedValueOnce({ id: 'session-1', courseId: 'course-1', classType, zoomMeetingId: null, deletedAt: null, date: new Date(), durationMinutes: 60 });
		mocks.createMeeting.mockResolvedValueOnce({ meetingId: '1', joinUrl: 'url', password: 'pass' });
		await expect(scheduleLiveClass('session-1', actor)).resolves.toEqual({ sessionId: 'session-1', liveScheduled: true });
	});
	it('rejects hall-only sessions', async () => {
		mocks.findSession.mockResolvedValueOnce({ courseId: 'course-1', classType: ClassType.PHYSICAL, zoomMeetingId: null, deletedAt: null });
		await expect(scheduleLiveClass('session-1', actor)).rejects.toMatchObject({ code: 'SESSION_NOT_ONLINE', statusCode: 400 });
	});
	it('rejects a scheduled session', async () => {
		await expect(scheduleLiveClass('session-1', actor)).rejects.toMatchObject({ code: 'ALREADY_SCHEDULED', statusCode: 409 });
	});
	it('rejects an absent session', async () => {
		mocks.findSession.mockResolvedValueOnce(null);
		await expect(scheduleLiveClass('session-1', actor)).rejects.toMatchObject({ code: 'CLASS_SESSION_NOT_FOUND', statusCode: 404 });
	});
	it('checks teacher ownership before session mode', async () => {
		mocks.assertCourseAccess.mockRejectedValueOnce({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
		mocks.findSession.mockResolvedValueOnce({ courseId: 'course-1', classType: ClassType.PHYSICAL, deletedAt: null });
		await expect(scheduleLiveClass('session-1', actor)).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
	});
});

describe('scheduleLiveClass concurrent mode change', () => {
	const actor = { userId: 'teacher-1', role: Role.TEACHER } as const;
	const schedulable = { id: 'session-1', courseId: 'course-1', title: 'Live lesson', classType: null, zoomMeetingId: null, deletedAt: null, date: new Date(), durationMinutes: 60 };
	it('stores the meeting only while the session is unscheduled and not hall only', async () => {
		mocks.findSession.mockResolvedValueOnce(schedulable);
		mocks.createMeeting.mockResolvedValueOnce({ meetingId: '1', joinUrl: 'url', password: 'pass' });
		await scheduleLiveClass('session-1', actor);
		expect(mocks.updateSession.mock.calls[0]?.[0].where).toEqual({
			id: 'session-1', zoomMeetingId: null, OR: [{ classType: null }, { classType: ClassType.ONLINE }],
		});
	});
	it('answers 409 when the session was switched to hall only while the meeting was being created', async () => {
		mocks.findSession.mockResolvedValueOnce(schedulable);
		mocks.createMeeting.mockResolvedValueOnce({ meetingId: '1', joinUrl: 'url', password: 'pass' });
		mocks.updateSession.mockRejectedValueOnce(Object.assign(new Error('P2025'), { code: 'P2025' }));
		await expect(scheduleLiveClass('session-1', actor)).rejects.toMatchObject({ code: 'SESSION_CHANGED', statusCode: 409 });
	});
	it('does not hide other database failures', async () => {
		mocks.findSession.mockResolvedValueOnce(schedulable);
		mocks.createMeeting.mockResolvedValueOnce({ meetingId: '1', joinUrl: 'url', password: 'pass' });
		mocks.updateSession.mockRejectedValueOnce(new Error('connection lost'));
		await expect(scheduleLiveClass('session-1', actor)).rejects.toThrow('connection lost');
	});
});
