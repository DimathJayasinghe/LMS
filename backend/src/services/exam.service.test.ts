import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	examFindMany,
	examFindUnique,
	assertStudentContentAccess,
	assertCourseAccess,
	createR2PresignedGetUrl,
} = vi.hoisted(() => ({
	examFindMany: vi.fn(),
	examFindUnique: vi.fn(),
	assertStudentContentAccess: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
	createR2PresignedGetUrl: vi.fn().mockResolvedValue('https://signed.example/paper.pdf'),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		exam: { findMany: examFindMany, findUnique: examFindUnique },
	},
}));

vi.mock('@/services/access.service', () => ({ assertStudentContentAccess }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/utils/r2', () => ({
	createR2PresignedGetUrl,
	createR2PresignedPutUrl: vi.fn(),
	r2HeadObject: vi.fn(),
}));

import { listExams, getExamById } from './exam.service';

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
