import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	examFindUnique,
	markerAssignmentFindUnique,
	submissionFindMany,
	submissionFindUnique,
	submissionUpdate,
	assertCourseAccess,
	broadcastResultsPublished,
} =
	vi.hoisted(() => ({
		examFindUnique: vi.fn(),
		markerAssignmentFindUnique: vi.fn(),
		submissionFindMany: vi.fn(),
		submissionFindUnique: vi.fn(),
		submissionUpdate: vi.fn(),
		assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
		broadcastResultsPublished: vi.fn(),
	}));

vi.mock('@/config/database', () => ({
	prisma: {
		exam: { findUnique: examFindUnique },
		markerAssignment: { findUnique: markerAssignmentFindUnique },
		submission: {
			findMany: submissionFindMany,
			findUnique: submissionFindUnique,
			update: submissionUpdate,
		},
	},
}));

vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({ broadcastResultsPublished }));
vi.mock('@/services/notification.service', () => ({ dispatch: vi.fn() }));
vi.mock('@/utils/r2', () => ({
	createR2PresignedGetUrl: vi.fn().mockResolvedValue('https://signed.example/answer.pdf'),
	createR2PresignedPutUrl: vi.fn(),
	r2HeadObject: vi.fn(),
}));

import { correctPublishedResult, listSubmissions, submitMarks } from './submission.service';

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
	broadcastResultsPublished.mockResolvedValue(undefined);
});

const publishedSubmission = {
	id: 'submission-1',
	status: 'COMPLETED',
	answerPdfUrl: null,
	answers: null,
	writtenAnswers: null,
	marks: 72,
	feedback: 'Initial feedback',
	examId: 'exam-1',
	userId: 'student-1',
	submittedAt: new Date('2026-07-01T01:00:00.000Z'),
	gradedAt: new Date('2026-07-02T00:00:00.000Z'),
	updatedAt: new Date('2026-07-02T00:00:00.000Z'),
	exam: {
		id: 'exam-1',
		title: 'Midterm',
		totalMarks: 100,
		isPublished: true,
		courseId: 'course-1',
		type: 'WRITTEN',
	},
};

describe('published-result immutability and correction', () => {
	it('locks assigned markers out once results are published', async () => {
		submissionFindUnique.mockResolvedValueOnce(publishedSubmission);
		markerAssignmentFindUnique.mockResolvedValueOnce({ markerId: 'marker-1', examId: 'exam-1' });

		await expect(
			submitMarks('submission-1', { marks: 75 }, 'marker-1'),
		).rejects.toMatchObject({ code: 'RESULTS_ALREADY_PUBLISHED', statusCode: 409 });
		expect(submissionUpdate).not.toHaveBeenCalled();
	});

	it('rejects a correction from a teacher who does not own the course', async () => {
		submissionFindUnique.mockResolvedValueOnce(publishedSubmission);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(
			correctPublishedResult(
				'submission-1',
				{ marks: 75, reason: 'Transcription error' },
				otherTeacher,
			),
		).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
		expect(submissionUpdate).not.toHaveBeenCalled();
	});

	it('records a teacher correction and returns the previous value for auditing', async () => {
		submissionFindUnique.mockResolvedValueOnce(publishedSubmission);
		submissionUpdate.mockResolvedValueOnce({
			...publishedSubmission,
			marks: 75,
			feedback: 'Corrected feedback',
		});

		const result = await correctPublishedResult(
			'submission-1',
			{ marks: 75, feedback: 'Corrected feedback', reason: 'Transcription error' },
			teacher,
		);

		expect(result.before).toEqual({ marks: 72, feedback: 'Initial feedback' });
		expect(submissionUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'submission-1' },
				data: expect.objectContaining({ marks: 75, feedback: 'Corrected feedback' }),
			}),
		);
		expect(broadcastResultsPublished).toHaveBeenCalledWith(
			expect.objectContaining({ examId: 'exam-1', courseId: 'course-1' }),
		);
	});
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
