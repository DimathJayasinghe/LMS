import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const { enrollmentFindFirst, paymentFindFirst, markerAssignmentFindUnique, markerAssignmentFindFirst, examFindUnique, participantFindUnique, userFindUnique, settingsFindUnique, grantFindMany } = vi.hoisted(() => ({
	grantFindMany: vi.fn(),
	enrollmentFindFirst: vi.fn(),
	paymentFindFirst: vi.fn(),
	markerAssignmentFindUnique: vi.fn(),
	markerAssignmentFindFirst: vi.fn(),
	examFindUnique: vi.fn(),
	participantFindUnique: vi.fn(),
	userFindUnique: vi.fn(),
	settingsFindUnique: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		enrollment: { findFirst: enrollmentFindFirst },
		user: { findUnique: userFindUnique },
		organizationSetting: { findUnique: settingsFindUnique },
		payment: { findFirst: paymentFindFirst },
	markerAssignment: { findUnique: markerAssignmentFindUnique, findFirst: markerAssignmentFindFirst },
	exam: { findUnique: examFindUnique },
	markerAssignmentAudience: { findMany: grantFindMany },
	examParticipant: { findUnique: participantFindUnique },
	},
}));

import { assertMarkerAssignedToExam, assertMarkerAssignedToExamAudience, getMarkerGrantedAudienceIds, assertStudentContentAccess, assertStudentExamStartAccess } from './access.service';

beforeEach(() => {
	enrollmentFindFirst.mockReset();
	paymentFindFirst.mockReset();
	markerAssignmentFindUnique.mockReset();
	markerAssignmentFindFirst.mockReset();
	grantFindMany.mockReset();
	examFindUnique.mockReset();
	participantFindUnique.mockReset();
	userFindUnique.mockReset().mockResolvedValue({ organizationId: 'org', organization: { timezone: 'Asia/Colombo' } });
	settingsFindUnique.mockReset().mockResolvedValue(null);
});

describe('assertStudentExamStartAccess', () => {
	const student = { userId: 'student-1', role: Role.STUDENT };
	const scoped = () => examFindUnique.mockResolvedValueOnce({ id: 'exam-1', courseId: 'course-1', paperRevisionId: 'revision-1' });
	const enrolled = () => enrollmentFindFirst.mockResolvedValueOnce({ id: 'enrollment-1' });
	const participant = (audience: { id: string; label: string; deliveryMode: 'ONLINE' | 'PHYSICAL'; institute: { name: string } | null }) =>
		participantFindUnique.mockResolvedValueOnce({ audience });
	const onlineAudience = { id: 'aud-1', label: 'Online group', deliveryMode: 'ONLINE' as const, institute: null };
	const hallAudience = { id: 'aud-2', label: 'Hall A', deliveryMode: 'PHYSICAL' as const, institute: { name: 'Nugegoda Centre' } };

	it('retains active course enrollment behavior for a legacy exam', async () => {
		examFindUnique.mockResolvedValueOnce({ id: 'exam-1', courseId: 'course-1', paperRevisionId: null });
		enrolled();
		await expect(assertStudentExamStartAccess(student, 'exam-1')).resolves.toBeUndefined();
		expect(participantFindUnique).not.toHaveBeenCalled();
	});
	it('answers an unknown exam with 404 before reading enrollment', async () => {
		examFindUnique.mockResolvedValueOnce(null);
		await expect(assertStudentExamStartAccess(student, 'nope')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND', statusCode: 404 });
		expect(enrollmentFindFirst).not.toHaveBeenCalled();
	});
	it('checks enrollment before the participant row', async () => {
		scoped();
		enrollmentFindFirst.mockResolvedValueOnce(null);
		await expect(assertStudentExamStartAccess(student, 'exam-1')).rejects.toMatchObject({ code: 'NOT_ENROLLED', statusCode: 403 });
		expect(participantFindUnique).not.toHaveBeenCalled();
	});
	it('lets an online participant start without sending an audience', async () => {
		scoped(); enrolled(); participant(onlineAudience);
		await expect(assertStudentExamStartAccess(student, 'exam-1')).resolves.toBeUndefined();
		expect(participantFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { examId_userId: { examId: 'exam-1', userId: 'student-1' } } }));
	});
	it('lets an online participant start when the sent audience is their own', async () => {
		scoped(); enrolled(); participant(onlineAudience);
		await expect(assertStudentExamStartAccess(student, 'exam-1', 'aud-1')).resolves.toBeUndefined();
	});
	it.each([undefined, 'aud-1'])('denies an unlisted enrolled student (audience sent: %s)', async (sent) => {
		scoped(); enrolled(); participantFindUnique.mockResolvedValueOnce(null);
		await expect(assertStudentExamStartAccess(student, 'exam-1', sent)).rejects.toMatchObject({ code: 'EXAM_PARTICIPANT_NOT_FOUND', statusCode: 403 });
	});
	it('tells a hall participant the paper is sat in the hall', async () => {
		scoped(); enrolled(); participant(hallAudience);
		await expect(assertStudentExamStartAccess(student, 'exam-1')).rejects.toMatchObject({ code: 'EXAM_PHYSICAL_AUDIENCE', statusCode: 409 });
	});
	it("refuses another audience's id sent by a listed student", async () => {
		scoped(); enrolled(); participant(onlineAudience);
		await expect(assertStudentExamStartAccess(student, 'exam-1', 'aud-9')).rejects.toMatchObject({ code: 'EXAM_AUDIENCE_MISMATCH', statusCode: 400 });
	});
	it.each([Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN, Role.MARKER])('does not apply to %s', async (role) => {
		await expect(assertStudentExamStartAccess({ userId: 'staff', role }, 'exam-1')).resolves.toBeUndefined();
		expect(examFindUnique).not.toHaveBeenCalled();
	});
});

describe('exact marker audience gate', () => {
	it('rejects a missing audience before an optional exam gate can broaden it', async () => {
		await expect(assertMarkerAssignedToExamAudience('marker', 'exam', '')).rejects.toMatchObject({ statusCode: 403 });
		expect(markerAssignmentFindFirst).not.toHaveBeenCalled();
	});
	it('does not turn a legacy assignment into an exact audience grant', async () => {
		examFindUnique.mockResolvedValue({ id: 'exam', paperRevisionId: null });
		markerAssignmentFindUnique.mockResolvedValue({ id: 'assignment', marker: { role: Role.MARKER, deletedAt: null } });
		markerAssignmentFindFirst.mockResolvedValue(null);
		await expect(assertMarkerAssignedToExamAudience('marker', 'exam', 'foreign-audience')).rejects.toMatchObject({ statusCode: 403 });
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
		enrollmentFindFirst.mockResolvedValue({ id: 'enrollment-1' });
		paymentFindFirst.mockResolvedValue(null);

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
		enrollmentFindFirst.mockResolvedValue({ id: 'enrollment-1' });
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

describe('getMarkerGrantedAudienceIds', () => {
	it('returns the audiences the marker holds an exact grant for on this exam', async () => {
		grantFindMany.mockResolvedValue([{ audienceId: 'a1' }, { audienceId: 'a2' }]);
		expect(await getMarkerGrantedAudienceIds('marker-1', 'exam-1')).toEqual(new Set(['a1', 'a2']));
	});

	it('scopes the query to this marker, this exam, and an active marker account', async () => {
		grantFindMany.mockResolvedValue([]);
		await getMarkerGrantedAudienceIds('marker-1', 'exam-1');
		expect(grantFindMany).toHaveBeenCalledWith({
			where: { examId: 'exam-1', assignment: { markerId: 'marker-1', marker: { role: Role.MARKER, deletedAt: null } } },
			select: { audienceId: true },
		});
	});

	it('returns an empty set for a marker with no grants, never a whole-exam pass', async () => {
		grantFindMany.mockResolvedValue([]);
		expect((await getMarkerGrantedAudienceIds('marker-1', 'exam-1')).size).toBe(0);
	});
});
