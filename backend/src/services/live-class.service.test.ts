import { ClassType, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findSession: vi.fn(),
	findUser: vi.fn(),
	redisSet: vi.fn(),
	assertCourseAccess: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	generateSignature: vi.fn(),
	getZak: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		classSession: { findUnique: mocks.findSession, update: vi.fn() },
		user: { findUnique: mocks.findUser },
	},
}));
vi.mock('@/config/redis', () => ({ redis: { set: mocks.redisSet } }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess: mocks.assertCourseAccess }));
vi.mock('@/services/access.service', () => ({ assertStudentContentAccess: mocks.assertStudentContentAccess }));
vi.mock('@/utils/zoom', () => ({
	createZoomMeeting: vi.fn(),
	generateMeetingSdkSignature: mocks.generateSignature,
	getZoomHostZak: mocks.getZak,
}));

import { issueLiveClassToken } from './live-class.service';

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
