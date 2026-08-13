import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttendanceSource, Role } from '@prisma/client';

const {
	classSessionFindUnique,
	courseFindUnique,
	instituteFindUnique,
	studentBarcodeFindUnique,
	userFindUnique,
	attendanceUpsert,
	attendanceFindMany,
	attendanceCount,
} = vi.hoisted(() => ({
	classSessionFindUnique: vi.fn(),
	courseFindUnique: vi.fn(),
	instituteFindUnique: vi.fn(),
	studentBarcodeFindUnique: vi.fn(),
	userFindUnique: vi.fn(),
	attendanceUpsert: vi.fn(),
	attendanceFindMany: vi.fn().mockResolvedValue([]),
	attendanceCount: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		classSession: { findUnique: classSessionFindUnique },
		course: { findUnique: courseFindUnique },
		institute: { findUnique: instituteFindUnique },
		studentBarcode: { findUnique: studentBarcodeFindUnique },
		user: { findUnique: userFindUnique },
		attendance: {
			upsert: attendanceUpsert,
			findMany: attendanceFindMany,
			count: attendanceCount,
		},
	},
}));

import { getAttendanceBySession, getAttendanceByCourse, scanBarcode } from './attendance.service';

const SUPER_ADMIN = { userId: 'sa-1', role: Role.SUPER_ADMIN };
const ADMIN = { userId: 'fd-1', role: Role.ADMIN };
const owningTeacher = { userId: 'teacher-1', role: Role.TEACHER };
const otherTeacher = { userId: 'teacher-2', role: Role.TEACHER };

const session = { id: 'session-1', courseId: 'course-1', deletedAt: null, timetableSlot: null };
const course = { id: 'course-1', teacherId: 'teacher-1' };
const student = { id: 'student-1', deletedAt: null, role: Role.STUDENT };
const scanInput = {
	barcode: 'INST-001',
	classSessionId: '11111111-1111-4111-8111-111111111111',
	instituteId: '22222222-2222-4222-8222-222222222222',
	source: AttendanceSource.BARCODE,
};

beforeEach(() => {
	classSessionFindUnique.mockReset().mockResolvedValue(session);
	courseFindUnique.mockReset().mockResolvedValue(course);
	instituteFindUnique.mockReset().mockResolvedValue({ id: scanInput.instituteId, isActive: true });
	studentBarcodeFindUnique.mockReset().mockResolvedValue({ user: student });
	userFindUnique.mockReset().mockResolvedValue(student);
	attendanceUpsert.mockReset().mockResolvedValue({ id: 'attendance-1' });
	attendanceFindMany.mockClear();
	attendanceCount.mockClear();
});

describe('scanBarcode - institute-aware resolution', () => {
	it('resolves an institute-issued barcode inside the selected institute', async () => {
		await scanBarcode(scanInput);

		expect(studentBarcodeFindUnique).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					instituteId_barcode: {
						instituteId: scanInput.instituteId,
						barcode: scanInput.barcode,
					},
				},
			}),
		);
		expect(userFindUnique).not.toHaveBeenCalled();
		expect(attendanceUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					userId: student.id,
					source: AttendanceSource.BARCODE,
				}),
			}),
		);
		const upsertArgs = attendanceUpsert.mock.calls[0]![0];
		expect(upsertArgs.update).not.toHaveProperty('source');
	});

	it('falls back to the global LMS barcode when no institute barcode matches', async () => {
		studentBarcodeFindUnique.mockResolvedValueOnce(null);

		await scanBarcode({ ...scanInput, barcode: 'LMS-001', source: AttendanceSource.QR });

		expect(userFindUnique).toHaveBeenCalledWith(
			expect.objectContaining({ where: { barcode: 'LMS-001' } }),
		);
		expect(attendanceUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ source: AttendanceSource.QR }),
			}),
		);
	});

	it('rejects an unknown or inactive institute before resolving the barcode', async () => {
		instituteFindUnique.mockResolvedValueOnce({ id: scanInput.instituteId, isActive: false });

		await expect(scanBarcode(scanInput)).rejects.toMatchObject({
			code: 'INSTITUTE_NOT_FOUND',
			statusCode: 404,
		});
		expect(studentBarcodeFindUnique).not.toHaveBeenCalled();
	});

	it('rejects an institute that conflicts with the session timetable slot', async () => {
		classSessionFindUnique.mockResolvedValueOnce({
			...session,
			timetableSlot: { instituteId: '33333333-3333-4333-8333-333333333333' },
		});

		await expect(scanBarcode(scanInput)).rejects.toMatchObject({
			code: 'SESSION_INSTITUTE_MISMATCH',
			statusCode: 409,
		});
		expect(studentBarcodeFindUnique).not.toHaveBeenCalled();
	});

	it('rejects a deactivated student resolved from an institute barcode', async () => {
		studentBarcodeFindUnique.mockResolvedValueOnce({
			user: { ...student, deletedAt: new Date() },
		});

		await expect(scanBarcode(scanInput)).rejects.toMatchObject({
			code: 'STUDENT_DEACTIVATED',
			statusCode: 403,
		});
		expect(attendanceUpsert).not.toHaveBeenCalled();
	});

	it('rejects a non-student resolved from an institute barcode', async () => {
		studentBarcodeFindUnique.mockResolvedValueOnce({
			user: { ...student, role: Role.TEACHER },
		});

		await expect(scanBarcode(scanInput)).rejects.toMatchObject({
			code: 'INVALID_ROLE_FOR_ATTENDANCE',
			statusCode: 400,
		});
		expect(attendanceUpsert).not.toHaveBeenCalled();
	});

	it('returns BARCODE_NOT_FOUND when neither institute nor LMS barcode matches', async () => {
		studentBarcodeFindUnique.mockResolvedValueOnce(null);
		userFindUnique.mockResolvedValueOnce(null);

		await expect(scanBarcode(scanInput)).rejects.toMatchObject({
			code: 'BARCODE_NOT_FOUND',
			statusCode: 404,
		});
		expect(attendanceUpsert).not.toHaveBeenCalled();
	});
});

describe('getAttendanceBySession — teacher-scoped access', () => {
	it('allows SUPER_ADMIN regardless of course ownership', async () => {
		await expect(getAttendanceBySession('session-1', SUPER_ADMIN)).resolves.toEqual([]);
	});

	it('allows ADMIN (front-desk) regardless of course ownership', async () => {
		await expect(getAttendanceBySession('session-1', ADMIN)).resolves.toEqual([]);
	});

	it('allows the owning TEACHER', async () => {
		await expect(getAttendanceBySession('session-1', owningTeacher)).resolves.toEqual([]);
	});

	it('blocks a TEACHER who does not own the course', async () => {
		await expect(getAttendanceBySession('session-1', otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(attendanceFindMany).not.toHaveBeenCalled();
	});

	it('404s for a missing session before the ownership check runs', async () => {
		classSessionFindUnique.mockResolvedValueOnce(null);
		await expect(getAttendanceBySession('missing', otherTeacher)).rejects.toMatchObject({
			code: 'CLASS_SESSION_NOT_FOUND',
			statusCode: 404,
		});
	});

	it('404s for a soft-deleted session', async () => {
		classSessionFindUnique.mockResolvedValueOnce({ ...session, deletedAt: new Date() });
		await expect(getAttendanceBySession('session-1', SUPER_ADMIN)).rejects.toMatchObject({
			code: 'CLASS_SESSION_NOT_FOUND',
		});
	});
});

describe('getAttendanceByCourse — teacher-scoped access', () => {
	const query = { page: 1, limit: 20 };

	it('allows SUPER_ADMIN regardless of course ownership', async () => {
		await expect(getAttendanceByCourse('course-1', query, SUPER_ADMIN)).resolves.toEqual({
			records: [],
			total: 0,
		});
	});

	it('allows the owning TEACHER', async () => {
		await expect(getAttendanceByCourse('course-1', query, owningTeacher)).resolves.toEqual({
			records: [],
			total: 0,
		});
	});

	it('blocks a TEACHER who does not own the course', async () => {
		await expect(getAttendanceByCourse('course-1', query, otherTeacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(attendanceFindMany).not.toHaveBeenCalled();
	});

	it('404s for a missing course before the ownership check runs', async () => {
		courseFindUnique.mockResolvedValueOnce(null);
		await expect(getAttendanceByCourse('missing', query, otherTeacher)).rejects.toMatchObject({
			code: 'CLASS_NOT_FOUND',
			statusCode: 404,
		});
	});
});
