import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const { enrollmentFindFirst, paymentFindFirst, markerAssignmentFindUnique, markerAssignmentFindFirst, examFindUnique, participantFindFirst } = vi.hoisted(() => ({
	enrollmentFindFirst: vi.fn(),
	paymentFindFirst: vi.fn(),
	markerAssignmentFindUnique: vi.fn(),
	markerAssignmentFindFirst: vi.fn(),
	examFindUnique: vi.fn(),
	participantFindFirst: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		enrollment: { findFirst: enrollmentFindFirst },
		payment: { findFirst: paymentFindFirst },
	markerAssignment: { findUnique: markerAssignmentFindUnique, findFirst: markerAssignmentFindFirst },
	exam: { findUnique: examFindUnique },
	examParticipant: { findFirst: participantFindFirst },
	},
}));

import { assertMarkerAssignedToExam, assertStudentContentAccess, assertStudentExamStartAccess } from './access.service';

beforeEach(() => {
	enrollmentFindFirst.mockReset();
	paymentFindFirst.mockReset();
	markerAssignmentFindUnique.mockReset();
	markerAssignmentFindFirst.mockReset();
	examFindUnique.mockReset();
	participantFindFirst.mockReset();
});

describe('assertStudentExamStartAccess', () => {
	const student = { userId: 'student-1', role: Role.STUDENT };
	it('retains active course enrollment behavior for a legacy exam', async () => {
		examFindUnique.mockResolvedValueOnce({ id: 'exam-1', courseId: 'course-1', paperRevisionId: null });
		enrollmentFindFirst.mockResolvedValueOnce({ id: 'enrollment-1' });
		await expect(assertStudentExamStartAccess(student, 'exam-1')).resolves.toBeUndefined();
		expect(participantFindFirst).not.toHaveBeenCalled();
	});
	it('denies an unlisted enrolled student on a scoped exam', async () => {
		examFindUnique.mockResolvedValueOnce({ id: 'exam-1', courseId: 'course-1', paperRevisionId: 'revision-1' });
		enrollmentFindFirst.mockResolvedValueOnce({ id: 'enrollment-1' });
		participantFindFirst.mockResolvedValueOnce(null);
		await expect(assertStudentExamStartAccess(student, 'exam-1', 'audience-1')).rejects.toMatchObject({ code: 'EXAM_PARTICIPANT_NOT_FOUND' });
	});
	it('denies a tampered or physical audience for a scoped online start', async () => {
		examFindUnique.mockResolvedValueOnce({ id: 'exam-1', courseId: 'course-1', paperRevisionId: 'revision-1' });
		enrollmentFindFirst.mockResolvedValueOnce({ id: 'enrollment-1' });
		participantFindFirst.mockResolvedValueOnce(null);
		await expect(assertStudentExamStartAccess(student, 'exam-1', 'other-audience')).rejects.toMatchObject({ code: 'EXAM_PARTICIPANT_NOT_FOUND' });
	});
});

describe('assertStudentContentAccess', () => {
	const student = { userId: 'student-1', role: Role.STUDENT };

	it('bypasses enrollment lookup for privileged roles', async () => {
		await expect(
			assertStudentContentAccess({ userId: 'super-admin-1', role: Role.SUPER_ADMIN }, 'course-1', { requirePaid: true }),
		).resolves.toBeUndefined();
		expect(enrollmentFindFirst).not.toHaveBeenCalled();
		expect(paymentFindFirst).not.toHaveBeenCalled();
	});

	it('rejects a student without an active enrollment', async () => {
		enrollmentFindFirst.mockResolvedValueOnce(null);

		await expect(assertStudentContentAccess(student, 'course-1')).rejects.toMatchObject({
			code: 'NOT_ENROLLED',
			statusCode: 403,
		});
		expect(enrollmentFindFirst).toHaveBeenCalledWith({
			where: { userId: student.userId, courseId: 'course-1', isActive: true },
			select: { id: true },
		});
	});

	it('allows an actively enrolled student when payment is not required', async () => {
		enrollmentFindFirst.mockResolvedValueOnce({ id: 'enrollment-1' });

		await expect(assertStudentContentAccess(student, 'course-1')).resolves.toBeUndefined();
		expect(paymentFindFirst).not.toHaveBeenCalled();
	});

	it('rejects an enrolled student without a successful current-month payment', async () => {
		enrollmentFindFirst.mockResolvedValueOnce({ id: 'enrollment-1' });
		paymentFindFirst.mockResolvedValueOnce(null);

		await expect(
			assertStudentContentAccess(student, 'course-1', { requirePaid: true }),
		).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED', statusCode: 402 });
		expect(paymentFindFirst).toHaveBeenCalledWith({
			where: {
				status: 'SUCCESS',
				paymentMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
				enrollment: { userId: student.userId, courseId: 'course-1' },
			},
			select: { id: true },
		});
	});

	it('allows paid content only after both enrollment and payment checks pass', async () => {
		enrollmentFindFirst.mockResolvedValueOnce({ id: 'enrollment-1' });
		paymentFindFirst.mockResolvedValueOnce({ id: 'payment-1' });

		await expect(
			assertStudentContentAccess(student, 'course-1', { requirePaid: true }),
		).resolves.toBeUndefined();
	});
});

describe('assertMarkerAssignedToExam', () => {
	it('resolves when the marker is assigned to the exam', async () => {
		examFindUnique.mockResolvedValueOnce({ id: 'e1', paperRevisionId: null });
		markerAssignmentFindUnique.mockResolvedValueOnce({ markerId: 'm1', examId: 'e1', marker: { role: Role.MARKER, deletedAt: null } });

		await expect(assertMarkerAssignedToExam('m1', 'e1')).resolves.toBeUndefined();
		expect(markerAssignmentFindUnique).toHaveBeenCalledWith({
			where: { markerId_examId: { markerId: 'm1', examId: 'e1' } },
			select: { id: true, marker: { select: { role: true, deletedAt: true } } },
		});
	});

	it('throws 403 MARKER_NOT_ASSIGNED when there is no assignment', async () => {
		examFindUnique.mockResolvedValueOnce({ id: 'e1', paperRevisionId: null });
		markerAssignmentFindUnique.mockResolvedValueOnce(null);

		await expect(assertMarkerAssignedToExam('m1', 'e1')).rejects.toMatchObject({
			code: 'MARKER_NOT_ASSIGNED',
			statusCode: 403,
		});
	});

	it('denies a scoped marker outside the participant audience', async () => {
		examFindUnique.mockResolvedValueOnce({ id: 'e1', paperRevisionId: 'revision-1' });
		markerAssignmentFindFirst.mockResolvedValueOnce(null);

		await expect(assertMarkerAssignedToExam('m1', 'e1', 'audience-other')).rejects.toMatchObject({
			code: 'MARKER_NOT_ASSIGNED',
			statusCode: 403,
		});
		expect(markerAssignmentFindFirst).toHaveBeenCalledWith({
			where: {
				markerId: 'm1',
				examId: 'e1',
				marker: { role: Role.MARKER, deletedAt: null },
				audienceGrants: { some: { audienceId: 'audience-other', examId: 'e1' } },
			},
			select: { id: true },
		});
	});
});
