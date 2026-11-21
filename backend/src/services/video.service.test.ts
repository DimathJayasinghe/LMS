import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role, VideoStatus } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	courseFindUnique,
	videoFindMany,
	videoCount,
	videoFindUnique,
	userFindUnique,
	assertStudentContentAccess,
	assertCourseAccess,
	getSignedBunnyEmbedUrl,
} = vi.hoisted(() => ({
	courseFindUnique: vi.fn(),
	videoFindMany: vi.fn(),
	videoCount: vi.fn(),
	videoFindUnique: vi.fn(),
	userFindUnique: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
	getSignedBunnyEmbedUrl: vi.fn().mockReturnValue({
		embedUrl: 'https://iframe.mediadelivery.net/embed/1/vid-1?token=x',
		expiresAt: 1234567890,
	}),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		course: { findUnique: courseFindUnique },
		videoRecording: { findMany: videoFindMany, count: videoCount, findUnique: videoFindUnique },
		user: { findUnique: userFindUnique },
	},
}));

vi.mock('@/services/access.service', () => ({ assertStudentContentAccess }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/utils/bunny', () => ({
	createBunnyVideo: vi.fn(),
	generateBunnyTusUpload: vi.fn(),
	getSignedBunnyEmbedUrl,
	resolveBunnyWebhookStatus: vi.fn(),
}));

import { listVideosByClass, getVideoById, generateStreamUrl } from './video.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER } as const;
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER } as const;
const superAdmin = { userId: 'admin-1', role: Role.SUPER_ADMIN } as const;
const forbidden = new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');

const videoRow = {
	id: 'vid-1',
	title: 'Lecture 1',
	bunnyVideoId: 'bunny-1',
	durationSeconds: 600,
	status: VideoStatus.READY,
	classSessionId: 'sess-1',
	createdAt: new Date('2026-06-01T00:00:00.000Z'),
	updatedAt: new Date('2026-06-01T00:00:00.000Z'),
	classSession: {
		id: 'sess-1',
		title: 'Session 1',
		date: new Date('2026-06-01T00:00:00.000Z'),
		courseId: 'course-1',
	},
};

beforeEach(() => {
	vi.clearAllMocks();
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	getSignedBunnyEmbedUrl.mockReturnValue({
		embedUrl: 'https://iframe.mediadelivery.net/embed/1/vid-1?token=x',
		expiresAt: 1234567890,
	});
});

describe('listVideosByClass — TEACHER course-ownership scoping', () => {
	it('calls assertCourseAccess with the courseId and acting TEACHER', async () => {
		courseFindUnique.mockResolvedValueOnce({ id: 'course-1' });
		videoFindMany.mockResolvedValueOnce([]);
		videoCount.mockResolvedValueOnce(0);

		await listVideosByClass('course-1', { page: 1, limit: 20 }, teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE, never reaching the query', async () => {
		courseFindUnique.mockResolvedValueOnce({ id: 'course-1' });
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(
			listVideosByClass('course-1', { page: 1, limit: 20 }, otherTeacher),
		).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
		expect(videoFindMany).not.toHaveBeenCalled();
	});

	it("SUPER_ADMIN lists any course's videos unaffected", async () => {
		courseFindUnique.mockResolvedValueOnce({ id: 'course-1' });
		videoFindMany.mockResolvedValueOnce([videoRow]);
		videoCount.mockResolvedValueOnce(1);

		const result = await listVideosByClass('course-1', { page: 1, limit: 20 }, superAdmin);

		expect(result.total).toBe(1);
		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', superAdmin);
	});
});

describe('getVideoById — TEACHER course-ownership scoping', () => {
	it("calls assertCourseAccess with the video's classSession.courseId", async () => {
		videoFindUnique.mockResolvedValueOnce(videoRow);

		await getVideoById('vid-1', teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE', async () => {
		videoFindUnique.mockResolvedValueOnce(videoRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(getVideoById('vid-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
	});
});

describe("generateStreamUrl — inherits getVideoById's course-ownership check", () => {
	it('rejects a non-owning TEACHER before minting a signed embed URL', async () => {
		videoFindUnique.mockResolvedValueOnce(videoRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(generateStreamUrl('vid-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(getSignedBunnyEmbedUrl).not.toHaveBeenCalled();
	});

	it('an enrolled+paid STUDENT is unaffected — assertCourseAccess is a no-op for STUDENT', async () => {
		videoFindUnique.mockResolvedValueOnce(videoRow);
		userFindUnique.mockResolvedValueOnce({ name: 'Nimal Perera', indexNumber: 42 });
		const student = { userId: 'student-1', role: Role.STUDENT } as const;

		const result = await generateStreamUrl('vid-1', student);

		expect(result.embedUrl).toContain('vid-1');
		expect(assertStudentContentAccess).toHaveBeenCalledWith(student, 'course-1', {
			requirePaid: true,
		});
	});
});
