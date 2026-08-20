import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	examFindMany,
	examFindUnique,
	assertStudentContentAccess,
	assertMarkerAssignedToExam,
	assertCourseAccess,
	createR2PresignedGetUrl,
	userFindMany,
	markerAssignmentFindMany,
	markerAssignmentDeleteMany,
	markerAssignmentCreateMany,
	transaction,
} = vi.hoisted(() => ({
	examFindMany: vi.fn(),
	examFindUnique: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	assertMarkerAssignedToExam: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
	createR2PresignedGetUrl: vi.fn().mockResolvedValue('https://signed.example/paper.pdf'),
	userFindMany: vi.fn(),
	markerAssignmentFindMany: vi.fn(),
	markerAssignmentDeleteMany: vi.fn(),
	markerAssignmentCreateMany: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		exam: { findMany: examFindMany, findUnique: examFindUnique },
		user: { findMany: userFindMany },
		markerAssignment: { findMany: markerAssignmentFindMany },
		$transaction: transaction,
	},
}));

vi.mock('@/services/access.service', () => ({ assertStudentContentAccess, assertMarkerAssignedToExam }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/utils/r2', () => ({
	createR2PresignedGetUrl,
	createR2PresignedPutUrl: vi.fn(),
	r2HeadObject: vi.fn(),
}));

import { getExamById, listExams, replaceExamMarkers } from './exam.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER } as const;
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER } as const;
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
	allowTypedAnswers: true,
	allowPdfUpload: false,
	courseId: 'course-1',
	deletedAt: null,
	createdAt: new Date('2026-06-01T00:00:00.000Z'),
	updatedAt: new Date('2026-06-01T00:00:00.000Z'),
	paperPdfUrl: null,
	mcqPayload: null,
};

beforeEach(() => {
	vi.clearAllMocks();
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	createR2PresignedGetUrl.mockResolvedValue('https://signed.example/paper.pdf');
	userFindMany.mockResolvedValue([]);
	markerAssignmentFindMany.mockResolvedValue([]);
	transaction.mockImplementation((callback) => callback({
		markerAssignment: {
			deleteMany: markerAssignmentDeleteMany,
			createMany: markerAssignmentCreateMany,
		},
	}));
});

describe('replaceExamMarkers — ownership and exact-set assignment', () => {
	it('rejects a non-owning teacher before looking up marker accounts', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(
			replaceExamMarkers('exam-1', { markerIds: ['marker-1'] }, otherTeacher),
		).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
		expect(userFindMany).not.toHaveBeenCalled();
	});

	it('rejects inactive or non-marker IDs', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		userFindMany.mockResolvedValueOnce([]);

		await expect(
			replaceExamMarkers('exam-1', { markerIds: ['not-a-marker'] }, teacher),
		).rejects.toMatchObject({ code: 'INVALID_MARKER_IDS', statusCode: 400 });
		expect(transaction).not.toHaveBeenCalled();
	});

	it('removes stale assignments and de-duplicates the requested marker set', async () => {
		examFindUnique.mockResolvedValue(examRow);
		userFindMany.mockResolvedValueOnce([{ id: 'marker-1' }, { id: 'marker-2' }]);

		await replaceExamMarkers(
			'exam-1',
			{ markerIds: ['marker-1', 'marker-2', 'marker-1'] },
			teacher,
		);

		expect(markerAssignmentDeleteMany).toHaveBeenCalledWith({
			where: { examId: 'exam-1', markerId: { notIn: ['marker-1', 'marker-2'] } },
		});
		expect(markerAssignmentCreateMany).toHaveBeenCalledWith({
			data: [
				{ markerId: 'marker-1', examId: 'exam-1' },
				{ markerId: 'marker-2', examId: 'exam-1' },
			],
			skipDuplicates: true,
		});
	});
});

describe('listExams — TEACHER course-ownership scoping', () => {
	it("scopes the query to the acting TEACHER's own courses", async () => {
		examFindMany.mockResolvedValueOnce([]);

		await listExams({ status: 'all' }, teacher);

		const call = examFindMany.mock.calls[0]![0];
		expect(call.where.course).toEqual({ teacherId: 'teacher-1' });
	});

	it('does not scope by teacherId for SUPER_ADMIN', async () => {
		examFindMany.mockResolvedValueOnce([]);

		await listExams({ status: 'all' }, superAdmin);

		const call = examFindMany.mock.calls[0]![0];
		expect(call.where.course).toBeUndefined();
	});

	it('keeps an explicit courseId filter alongside the TEACHER ownership scope', async () => {
		examFindMany.mockResolvedValueOnce([]);

		await listExams({ status: 'all', courseId: 'course-9' }, teacher);

		const call = examFindMany.mock.calls[0]![0];
		expect(call.where.courseId).toBe('course-9');
		expect(call.where.course).toEqual({ teacherId: 'teacher-1' });
	});
});

describe('getExamById — TEACHER course-ownership scoping', () => {
	it("calls assertCourseAccess with the exam's courseId and the acting TEACHER", async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		await getExamById('exam-1', teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
	});

	it('rejects a TEACHER who does not own the course with FORBIDDEN_COURSE', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);
		assertCourseAccess.mockRejectedValueOnce(forbidden);

		await expect(getExamById('exam-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
	});

	it('SUPER_ADMIN reads any course\'s exam unaffected', async () => {
		examFindUnique.mockResolvedValueOnce(examRow);

		const result = await getExamById('exam-1', superAdmin);

		expect(result.id).toBe('exam-1');
		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', superAdmin);
	});
});

describe('listExams — MARKER + ADMIN authorization', () => {
	it("scopes the query to the marker's assigned exams", async () => {
		examFindMany.mockResolvedValueOnce([]);

		await listExams({ status: 'all' }, { userId: 'm1', role: Role.MARKER });

		const call = examFindMany.mock.calls[0]![0];
		expect(call.where.markerAssignments).toEqual({ some: { markerId: 'm1' } });
	});

	it('denies front-desk ADMIN with 403 FORBIDDEN, never querying', async () => {
		await expect(
			listExams({ status: 'all' }, { userId: 'a1', role: Role.ADMIN }),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(examFindMany).not.toHaveBeenCalled();
	});
});

describe('getExamById — MARKER + ADMIN authorization', () => {
	const mcqExamRow = {
		...examRow,
		paperPdfUrl: 'exam-papers/exam-1/paper.pdf',
		mcqPayload: {
			questions: [
				{
					id: 'q1',
					text: 'Q1',
					order: 1,
					marks: 2,
					options: [
						{ id: 'o1', text: 'A', isCorrect: true },
						{ id: 'o2', text: 'B', isCorrect: false },
					],
				},
			],
		},
	};

	it('lets an assigned MARKER read the exam but strips the MCQ answer key', async () => {
		examFindUnique.mockResolvedValueOnce(mcqExamRow);
		assertMarkerAssignedToExam.mockResolvedValueOnce(undefined);

		const result = await getExamById('exam-1', { userId: 'm1', role: Role.MARKER });

		expect(assertMarkerAssignedToExam).toHaveBeenCalledWith('m1', 'exam-1');
		const opts = (result.mcqPayload as { questions: { options: Record<string, unknown>[] }[] }).questions[0]!.options;
		expect(opts[0]).not.toHaveProperty('isCorrect');
		expect(result.paperPdfUrl).toBe('https://signed.example/paper.pdf'); // marker still gets the paper
	});

	it('rejects a MARKER not assigned to the exam with 403 MARKER_NOT_ASSIGNED', async () => {
		examFindUnique.mockResolvedValueOnce(mcqExamRow);
		assertMarkerAssignedToExam.mockRejectedValueOnce(
			new AppError('MARKER_NOT_ASSIGNED', 403, 'You are not assigned to mark this exam.'),
		);

		await expect(
			getExamById('exam-1', { userId: 'm2', role: Role.MARKER }),
		).rejects.toMatchObject({ code: 'MARKER_NOT_ASSIGNED', statusCode: 403 });
	});

	it('denies front-desk ADMIN with 403 FORBIDDEN before fetching the exam', async () => {
		await expect(
			getExamById('exam-1', { userId: 'a1', role: Role.ADMIN }),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(examFindUnique).not.toHaveBeenCalled();
	});

	it('SUPER_ADMIN still gets the full MCQ payload with answers', async () => {
		examFindUnique.mockResolvedValueOnce(mcqExamRow);

		const result = await getExamById('exam-1', superAdmin);

		const opts = (result.mcqPayload as { questions: { options: Record<string, unknown>[] }[] }).questions[0]!.options;
		expect(opts[0]).toHaveProperty('isCorrect', true);
	});
});
