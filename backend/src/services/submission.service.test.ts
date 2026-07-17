import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const { examFindUnique, markerAssignmentFindUnique, submissionFindMany, assertCourseAccess } =
	vi.hoisted(() => ({
		examFindUnique: vi.fn(),
		markerAssignmentFindUnique: vi.fn(),
		submissionFindMany: vi.fn(),
		assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
	}));

vi.mock('@/config/database', () => ({
	prisma: {
		exam: { findUnique: examFindUnique },
		markerAssignment: { findUnique: markerAssignmentFindUnique },
		submission: { findMany: submissionFindMany },
	},
}));

vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/services/notification.service', () => ({ dispatch: vi.fn() }));
vi.mock('@/utils/r2', () => ({
	createR2PresignedGetUrl: vi.fn().mockResolvedValue('https://signed.example/answer.pdf'),
	createR2PresignedPutUrl: vi.fn(),
	r2HeadObject: vi.fn(),
}));

import { listSubmissions } from './submission.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER } as const;
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER } as const;
const marker = { userId: 'marker-1', role: Role.MARKER } as const;
const superAdmin = { userId: 'admin-1', role: Role.SUPER_ADMIN } as const;
const forbidden = new AppError('FORBIDDEN_COURSE', 403, 'You can only manage your own courses.');

const examRow = {
	id: 'exam-1',
	title: 'Midterm',
	type: 'WRITTEN',
	startTime: new Date('2026-07-01T00:00:00.000Z'),
	endTime: new Date('2026-07-01T02:00:00.000Z'),
	totalMarks: 100,
	isPublished: false,
	deletedAt: null,
	mcqPayload: null,
	allowTypedAnswers: true,
	allowPdfUpload: false,
	courseId: 'course-1',
};

const query = { status: 'all' as const, graded: 'all' as const };

beforeEach(() => {
	vi.clearAllMocks();
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	submissionFindMany.mockResolvedValue([]);
});

describe('listSubmissions — TEACHER course-ownership scoping', () => {
	it("calls assertCourseAccess with the exam's courseId for a TEACHER caller", async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		await listSubmissions('exam-1', query, teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a non-owning TEACHER with FORBIDDEN_COURSE, never querying submissions', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(listSubmissions('exam-1', query, otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(submissionFindMany).not.toHaveBeenCalled();
	});

	it("SUPER_ADMIN reads any exam's submissions unaffected", async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		await listSubmissions('exam-1', query, superAdmin);

		// This test would have caught the old if/else bug: if the code was
		// if (MARKER) { check } else { assertCourseAccess(...) } (no explicit
		// TEACHER role check), a SUPER_ADMIN actor — being "not MARKER" — would
		// incorrectly fall into the else and trigger assertCourseAccess. With
		// two independent if-blocks gated on exact roles, SUPER_ADMIN matches
		// neither and this call is correctly skipped.
		expect(assertCourseAccess).not.toHaveBeenCalled();
		expect(submissionFindMany).toHaveBeenCalled();
	});
});

describe('listSubmissions — MARKER assignment gate is unaffected by the new TEACHER check', () => {
	it('calls ensureMarkerAssigned for a MARKER and never calls assertCourseAccess', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		markerAssignmentFindUnique.mockResolvedValueOnce({ markerId: 'marker-1', examId: 'exam-1' });

		await listSubmissions('exam-1', query, marker);

		expect(markerAssignmentFindUnique).toHaveBeenCalledWith({
			where: { markerId_examId: { markerId: 'marker-1', examId: 'exam-1' } },
		});
		expect(assertCourseAccess).not.toHaveBeenCalled();
	});

	it('still rejects an unassigned MARKER with MARKER_NOT_ASSIGNED', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		markerAssignmentFindUnique.mockResolvedValueOnce(null);

		await expect(listSubmissions('exam-1', query, marker)).rejects.toMatchObject({
			code: 'MARKER_NOT_ASSIGNED',
			statusCode: 403,
		});
	});

	it('when TEACHER calls listSubmissions, ensureMarkerAssigned (markerAssignmentFindUnique) is never called', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		await listSubmissions('exam-1', query, teacher);

		// This test verifies a TEACHER caller never triggers the MARKER-only code path.
		// It does not by itself prove the if-blocks are independent (a TEACHER actor
		// behaves the same under either an if/else or two independent ifs) — see the
		// SUPER_ADMIN test above for the assertion that actually distinguishes the two.
		expect(markerAssignmentFindUnique).not.toHaveBeenCalled();
		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});
});
