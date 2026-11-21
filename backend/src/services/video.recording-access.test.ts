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
	assertCourseAccess: vi.fn(),
	getSignedBunnyEmbedUrl: vi.fn(),
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

const ROLE_ERR = { code: 'FORBIDDEN_ROLE', statusCode: 403 };
const COURSE_ERR = { code: 'FORBIDDEN_COURSE', statusCode: 403 };
const ENROLL_ERR = { code: 'NOT_ENROLLED', statusCode: 403 };
const PAY_ERR = { code: 'PAYMENT_REQUIRED', statusCode: 402 };

type Actor = { userId: string; role: Role };
const owner: Actor = { userId: 'owner-1', role: Role.SUPER_ADMIN };
const owningTeacher: Actor = { userId: 'teacher-1', role: Role.TEACHER };
const otherTeacher: Actor = { userId: 'teacher-2', role: Role.TEACHER };
const frontDesk: Actor = { userId: 'desk-1', role: Role.ADMIN };
const marker: Actor = { userId: 'marker-1', role: Role.MARKER };
const paidStudent: Actor = { userId: 'stu-paid', role: Role.STUDENT };
const unpaidStudent: Actor = { userId: 'stu-unpaid', role: Role.STUDENT };
const unenrolledStudent: Actor = { userId: 'stu-none', role: Role.STUDENT };

const videoRow = {
	id: 'vid-1',
	title: 'Lecture 1',
	bunnyVideoId: 'bunny-secret-guid',
	durationSeconds: 600,
	status: VideoStatus.READY,
	classSessionId: 'sess-1',
	createdAt: new Date('2026-06-01T00:00:00.000Z'),
	updatedAt: new Date('2026-06-01T00:00:00.000Z'),
	classSession: { id: 'sess-1', title: 'S1', date: new Date('2026-06-01'), courseId: 'course-1' },
};
const { bunnyVideoId: _omit, ...studentRow } = videoRow;
void _omit;

const query = { page: 1, limit: 20 };

type Op = 'list' | 'get' | 'stream';
const run = (op: Op, actor: Actor) =>
	op === 'list'
		? listVideosByClass('course-1', query, actor)
		: op === 'get'
			? getVideoById('vid-1', actor)
			: generateStreamUrl('vid-1', actor);

beforeEach(() => {
	vi.resetAllMocks();
	courseFindUnique.mockResolvedValue({ id: 'course-1' });
	// Row shape follows the `select` the service asks for: students never get bunnyVideoId.
	videoFindUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) =>
		select.bunnyVideoId ? videoRow : studentRow,
	);
	videoFindMany.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => [
		select.bunnyVideoId ? videoRow : studentRow,
	]);
	videoCount.mockResolvedValue(1);
	userFindUnique.mockResolvedValue({ name: 'Nimal Perera', indexNumber: 42 });
	getSignedBunnyEmbedUrl.mockReturnValue({ embedUrl: 'https://iframe.example/embed?token=x', expiresAt: 1 });
	assertCourseAccess.mockImplementation(async (_courseId: string, actor: Actor) => {
		if (actor.role === Role.TEACHER && actor.userId !== 'teacher-1') {
			throw new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');
		}
		return { id: 'course-1', teacherId: 'teacher-1' };
	});
	assertStudentContentAccess.mockImplementation(
		async (actor: Actor, _courseId: string, opts: { requirePaid?: boolean } = {}) => {
			if (actor.role !== Role.STUDENT) return;
			if (actor.userId === 'stu-none') throw new AppError('NOT_ENROLLED', 403, 'x');
			if (opts.requirePaid && actor.userId === 'stu-unpaid') throw new AppError('PAYMENT_REQUIRED', 402, 'x');
		},
	);
});

describe('recording reads: actor x operation matrix', () => {
	const cases: Array<[string, Actor, Record<Op, 'allow' | typeof ROLE_ERR>]> = [
		['owner', owner, { list: 'allow', get: 'allow', stream: 'allow' }],
		['owning teacher', owningTeacher, { list: 'allow', get: 'allow', stream: 'allow' }],
		['front desk', frontDesk, { list: ROLE_ERR, get: ROLE_ERR, stream: ROLE_ERR }],
		['marker', marker, { list: ROLE_ERR, get: ROLE_ERR, stream: ROLE_ERR }],
		['enrolled and paid student', paidStudent, { list: 'allow', get: 'allow', stream: 'allow' }],
	];

	for (const [name, actor, expected] of cases) {
		for (const op of ['list', 'get', 'stream'] as Op[]) {
			it(`${name}: ${op}`, async () => {
				const outcome = expected[op];
				if (outcome === 'allow') await expect(run(op, actor)).resolves.toBeTruthy();
				else await expect(run(op, actor)).rejects.toMatchObject(outcome);
			});
		}
	}

	for (const op of ['list', 'get', 'stream'] as Op[]) {
		it(`other teacher: ${op} is FORBIDDEN_COURSE`, async () => {
			await expect(run(op, otherTeacher)).rejects.toMatchObject(COURSE_ERR);
		});
		it(`unenrolled student: ${op} is NOT_ENROLLED`, async () => {
			await expect(run(op, unenrolledStudent)).rejects.toMatchObject(ENROLL_ERR);
		});
	}

	it('enrolled unpaid student: may list and read metadata but not stream (402)', async () => {
		await expect(run('list', unpaidStudent)).resolves.toBeTruthy();
		await expect(run('get', unpaidStudent)).resolves.toBeTruthy();
		await expect(run('stream', unpaidStudent)).rejects.toMatchObject(PAY_ERR);
		expect(getSignedBunnyEmbedUrl).not.toHaveBeenCalled();
	});
});

describe('recording reads: refused roles learn nothing and cost nothing', () => {
	for (const [name, actor] of [['front desk', frontDesk], ['marker', marker]] as const) {
		for (const op of ['list', 'get', 'stream'] as Op[]) {
			it(`${name} ${op}: refused before any database read`, async () => {
				await expect(run(op, actor)).rejects.toMatchObject(ROLE_ERR);
				expect(videoFindUnique).not.toHaveBeenCalled();
				expect(videoFindMany).not.toHaveBeenCalled();
				expect(courseFindUnique).not.toHaveBeenCalled();
				expect(getSignedBunnyEmbedUrl).not.toHaveBeenCalled();
			});
		}
	}

	it('front desk on a video that does not exist gets 403, not 404', async () => {
		videoFindUnique.mockResolvedValue(null);
		await expect(getVideoById('missing', frontDesk)).rejects.toMatchObject(ROLE_ERR);
	});
});

describe('recording reads: not-found cases', () => {
	it.each([
		['owner', owner],
		['owning teacher', owningTeacher],
		['paid student', paidStudent],
	])('%s: unknown video is 404 VIDEO_NOT_FOUND on get and stream', async (_n, actor) => {
		videoFindUnique.mockResolvedValue(null);
		await expect(getVideoById('missing', actor)).rejects.toMatchObject({ code: 'VIDEO_NOT_FOUND', statusCode: 404 });
		await expect(generateStreamUrl('missing', actor)).rejects.toMatchObject({ code: 'VIDEO_NOT_FOUND' });
	});

	it.each([
		['owner', owner],
		['owning teacher', owningTeacher],
		['paid student', paidStudent],
	])('%s: unknown course is 404 CLASS_NOT_FOUND on list', async (_n, actor) => {
		courseFindUnique.mockResolvedValue(null);
		await expect(listVideosByClass('missing', query, actor)).rejects.toMatchObject({
			code: 'CLASS_NOT_FOUND',
			statusCode: 404,
		});
	});
});

describe('recording reads: check ordering', () => {
	it('an unenrolled student gets NOT_ENROLLED, not PAYMENT_REQUIRED, on stream', async () => {
		await expect(generateStreamUrl('vid-1', unenrolledStudent)).rejects.toMatchObject(ENROLL_ERR);
	});

	it('the stream path runs the student gate once, with payment required', async () => {
		await generateStreamUrl('vid-1', paidStudent);
		expect(assertStudentContentAccess).toHaveBeenCalledTimes(1);
		expect(assertStudentContentAccess).toHaveBeenCalledWith(paidStudent, 'course-1', { requirePaid: true });
	});

	it('list and get ask students for enrollment only (no payment)', async () => {
		await listVideosByClass('course-1', query, paidStudent);
		await getVideoById('vid-1', paidStudent);
		for (const call of assertStudentContentAccess.mock.calls) expect(call[2]).toEqual({ requirePaid: false });
	});

	it('an enrolled student on a video that is not ready gets VIDEO_NOT_READY only after the gate', async () => {
		videoFindUnique.mockImplementation(async () => ({ ...videoRow, status: VideoStatus.UPLOADING }));
		await expect(generateStreamUrl('vid-1', paidStudent)).rejects.toMatchObject({ code: 'VIDEO_NOT_READY' });
		await expect(generateStreamUrl('vid-1', unpaidStudent)).rejects.toMatchObject(PAY_ERR);
	});
});

describe('recording reads: response shape', () => {
	it('never includes the provider video id for a student, in list or get', async () => {
		const list = await listVideosByClass('course-1', query, paidStudent);
		const one = await getVideoById('vid-1', paidStudent);
		expect(JSON.stringify(list)).not.toContain('bunny-secret-guid');
		expect(JSON.stringify(one)).not.toContain('bunny-secret-guid');
		expect(videoFindMany.mock.calls[0]![0].select.bunnyVideoId).toBeUndefined();
		expect(videoFindUnique.mock.calls[0]![0].select.bunnyVideoId).toBeUndefined();
	});

	it('the stream result carries no provider video id either, only the signed embed URL', async () => {
		const result = await generateStreamUrl('vid-1', paidStudent);
		expect(JSON.stringify(result.video)).not.toContain('bunny-secret-guid');
		expect(getSignedBunnyEmbedUrl).toHaveBeenCalledWith('bunny-secret-guid');
		expect(result.embedUrl).toContain('token=');
	});

	it('the owning teacher and the owner still see the provider id on list and get (they manage the upload)', async () => {
		for (const actor of [owner, owningTeacher]) {
			const one = await getVideoById('vid-1', actor);
			expect((one as { bunnyVideoId?: string }).bunnyVideoId).toBe('bunny-secret-guid');
		}
	});
});
