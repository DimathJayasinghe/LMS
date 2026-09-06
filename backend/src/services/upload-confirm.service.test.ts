import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExamType, Role, SubmissionStatus } from '@prisma/client';

// ─── Mocks ────────────────────────────────────────────────────────────────────
const {
	userFindUnique,
	userUpdate,
	examFindUnique,
	examUpdate,
	subFindUnique,
	subUpdate,
	r2Head,
	assertCourseAccess,
} = vi.hoisted(() => ({
	userFindUnique: vi.fn(),
	userUpdate: vi.fn(),
	examFindUnique: vi.fn(),
	examUpdate: vi.fn(),
	subFindUnique: vi.fn(),
	subUpdate: vi.fn(),
	r2Head: vi.fn(),
	assertCourseAccess: vi.fn().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' }),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		user: { findUnique: userFindUnique, update: userUpdate },
		exam: { findUnique: examFindUnique, update: examUpdate },
		submission: { findUnique: subFindUnique, update: subUpdate },
	},
}));

vi.mock('@/utils/r2', () => ({
	r2HeadObject: r2Head,
	createR2PresignedPutUrl: vi.fn(),
	createR2PresignedGetUrl: vi.fn(),
}));

// Confirm paths don't emit SSE/SMS — stub the infra-heavy modules so imports
// don't pull in redis/bullmq at test load.
vi.mock('@/services/stream.service', () => ({}));
vi.mock('@/services/notification.service', () => ({ dispatch: vi.fn() }));
vi.mock('@/services/access.service', () => ({ assertStudentContentAccess: vi.fn() }));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));

import { confirmNicUpload } from './user.service';
import { confirmExamPaper } from './exam.service';
import { completeSubmission } from './submission.service';

const actor = { userId: 'admin-1', role: Role.SUPER_ADMIN } as const;

beforeEach(() => {
	vi.clearAllMocks();
	r2Head.mockResolvedValue({ exists: true });
	assertCourseAccess.mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
});

// ─── NIC confirm ────────────────────────────────────────────────────────────
describe('confirmNicUpload', () => {
	const key = (uid: string, side: string) => `nic/${uid}/${side}-photo.jpg`;

	it('rejects a key that does not belong to the caller — before any HEAD', async () => {
		await expect(
			confirmNicUpload('user-1', { side: 'FRONT', key: key('someone-else', 'front') }),
		).rejects.toMatchObject({ code: 'FORBIDDEN_KEY', statusCode: 403 });
		expect(r2Head).not.toHaveBeenCalled();
		expect(userUpdate).not.toHaveBeenCalled();
	});

	it('409s and writes nothing when the object is not in R2', async () => {
		r2Head.mockResolvedValueOnce({ exists: false });
		await expect(
			confirmNicUpload('user-1', { side: 'FRONT', key: key('user-1', 'front') }),
		).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', statusCode: 409 });
		expect(userUpdate).not.toHaveBeenCalled();
	});

	it('stores the FRONT key but leaves setupCompleted false when BACK is missing', async () => {
		userFindUnique.mockResolvedValueOnce({ nicFrontUrl: null, nicBackUrl: null });
		userUpdate.mockResolvedValueOnce({ setupCompleted: false });

		const res = await confirmNicUpload('user-1', { side: 'FRONT', key: key('user-1', 'front') });

		expect(res).toEqual({ setupCompleted: false });
		expect(userUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ nicFrontUrl: key('user-1', 'front') }),
			}),
		);
		// setupCompleted not forced true
		expect(userUpdate.mock.calls[0]![0].data.setupCompleted).toBeUndefined();
	});

	it('flips setupCompleted once the second side lands', async () => {
		userFindUnique.mockResolvedValueOnce({ nicFrontUrl: 'nic/user-1/front-x.jpg', nicBackUrl: null });
		userUpdate.mockResolvedValueOnce({ setupCompleted: true });

		const res = await confirmNicUpload('user-1', { side: 'BACK', key: key('user-1', 'back') });

		expect(res).toEqual({ setupCompleted: true });
		expect(userUpdate.mock.calls[0]![0].data.setupCompleted).toBe(true);
	});
});

// ─── Exam paper confirm ─────────────────────────────────────────────────────
describe('confirmExamPaper', () => {
	const exam = (over = {}) => ({
		id: 'exam-1',
		courseId: 'course-1',
		type: ExamType.WRITTEN,
		deletedAt: null,
		...over,
	});

	it('persists paperPdfUrl after verifying the object exists', async () => {
		examFindUnique.mockResolvedValueOnce(exam());
		examUpdate.mockResolvedValueOnce({});

		const res = await confirmExamPaper('exam-1', { key: 'exams/exam-1/paper.pdf' }, actor);

		expect(res).toEqual({ paperPdfUrl: 'exams/exam-1/paper.pdf' });
		expect(examUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ data: { paperPdfUrl: 'exams/exam-1/paper.pdf' } }),
		);
	});

	it('rejects a key for a different exam', async () => {
		examFindUnique.mockResolvedValueOnce(exam());
		await expect(
			confirmExamPaper('exam-1', { key: 'exams/other-exam/paper.pdf' }, actor),
		).rejects.toMatchObject({ code: 'FORBIDDEN_KEY', statusCode: 403 });
		expect(r2Head).not.toHaveBeenCalled();
	});

	it('409s when the object never landed', async () => {
		examFindUnique.mockResolvedValueOnce(exam());
		r2Head.mockResolvedValueOnce({ exists: false });
		await expect(
			confirmExamPaper('exam-1', { key: 'exams/exam-1/paper.pdf' }, actor),
		).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', statusCode: 409 });
		expect(examUpdate).not.toHaveBeenCalled();
	});

	it('rejects an MCQ exam', async () => {
		examFindUnique.mockResolvedValueOnce(exam({ type: ExamType.MCQ }));
		await expect(
			confirmExamPaper('exam-1', { key: 'exams/exam-1/paper.pdf' }, actor),
		).rejects.toMatchObject({ code: 'PAPER_NOT_ALLOWED', statusCode: 400 });
	});
});

// ─── Submission complete (answer PDF verification) ──────────────────────────
describe('completeSubmission — answer PDF verification', () => {
	const future = new Date(Date.now() + 60 * 60 * 1000);
	const sub = (over = {}) => ({
		id: 'sub-1',
		userId: 'student-1',
		examId: 'exam-1',
		status: SubmissionStatus.UPLOADING,
			exam: { endTime: future, isPublished: false, courseId: 'course-1', deletedAt: null },
		...over,
	});

	it('verifies + persists answerPdfUrl when a key is supplied', async () => {
		subFindUnique.mockResolvedValueOnce(sub());
		subUpdate.mockResolvedValueOnce({ id: 'sub-1' });

		await completeSubmission('sub-1', 'student-1', { key: 'answers/exam-1/student-1/a.pdf' });

		expect(r2Head).toHaveBeenCalledWith('answers/exam-1/student-1/a.pdf');
		expect(subUpdate.mock.calls[0]![0].data).toMatchObject({
			status: SubmissionStatus.COMPLETED,
			answerPdfUrl: 'answers/exam-1/student-1/a.pdf',
		});
	});

	it('replays an already completed MCQ/typed attempt without touching R2', async () => {
		subFindUnique.mockResolvedValueOnce(sub({ status: SubmissionStatus.COMPLETED }));

		await completeSubmission('sub-1', 'student-1', {});

		expect(r2Head).not.toHaveBeenCalled();
		expect(subUpdate).not.toHaveBeenCalled();
	});

	it('rejects a key belonging to another student/exam', async () => {
		subFindUnique.mockResolvedValueOnce(sub());
		await expect(
			completeSubmission('sub-1', 'student-1', { key: 'answers/exam-1/other/a.pdf' }),
		).rejects.toMatchObject({ code: 'FORBIDDEN_KEY', statusCode: 403 });
		expect(subUpdate).not.toHaveBeenCalled();
	});

	it('409s when the answer PDF never landed', async () => {
		subFindUnique.mockResolvedValueOnce(sub());
		r2Head.mockResolvedValueOnce({ exists: false });
		await expect(
			completeSubmission('sub-1', 'student-1', { key: 'answers/exam-1/student-1/a.pdf' }),
		).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND', statusCode: 409 });
		expect(subUpdate).not.toHaveBeenCalled();
	});
});
