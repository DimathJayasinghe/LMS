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

import { getAttendanceBySession, getAttendanceByCourse, getStudentAttendance, scanBarcode } from './attendance.service';

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


describe('getStudentAttendance - role and target scoping', () => {
	const query = { page: 1, limit: 20 };
	const MARKER = { userId: 'marker-1', role: Role.MARKER };
	const studentSelf = { userId: 'student-1', role: Role.STUDENT };
	const studentOther = { userId: 'student-9', role: Role.STUDENT };

	const targets: Record<string, { id: string; role: Role; deletedAt: Date | null } | null> = {
		student: { id: 'student-1', role: Role.STUDENT, deletedAt: null },
		'teacher id': { id: 'student-1', role: Role.TEACHER, deletedAt: null },
		'marker id': { id: 'student-1', role: Role.MARKER, deletedAt: null },
		'front-desk id': { id: 'student-1', role: Role.ADMIN, deletedAt: null },
		'soft-deleted student': { id: 'student-1', role: Role.STUDENT, deletedAt: new Date('2026-05-01') },
		'missing id': null,
	};
	const setTarget = (name: keyof typeof targets) => userFindUnique.mockResolvedValue(targets[name]);

	it.each([
		['owner', SUPER_ADMIN],
		['front desk', ADMIN],
		['owning teacher', owningTeacher],
		['student (self)', studentSelf],
	])('%s reads a student history', async (_n, actor) => {
		setTarget('student');
		await expect(getStudentAttendance('student-1', actor, query)).resolves.toEqual({ records: [], total: 0 });
	});

	it.each(['teacher id', 'marker id', 'front-desk id', 'missing id'])(
		'a %s as target is the same 404 for every allowed role',
		async (name) => {
			for (const actor of [SUPER_ADMIN, ADMIN, owningTeacher, studentSelf]) {
				setTarget(name);
				await expect(getStudentAttendance('student-1', actor, query)).rejects.toMatchObject({
					code: 'USER_NOT_FOUND',
					statusCode: 404,
				});
			}
		},
	);

	it('owner and front desk can still read a soft-deleted student (history survives); teacher cannot', async () => {
		setTarget('soft-deleted student');
		await expect(getStudentAttendance('student-1', SUPER_ADMIN, query)).resolves.toBeTruthy();
		await expect(getStudentAttendance('student-1', ADMIN, query)).resolves.toBeTruthy();
		await expect(getStudentAttendance('student-1', owningTeacher, query)).rejects.toMatchObject({
			code: 'USER_NOT_FOUND',
		});
	});

	it('marker is refused 403 before any database read', async () => {
		await expect(getStudentAttendance('student-1', MARKER, query)).rejects.toMatchObject({
			code: 'FORBIDDEN_ROLE',
			statusCode: 403,
		});
		expect(userFindUnique).not.toHaveBeenCalled();
		expect(attendanceFindMany).not.toHaveBeenCalled();
	});

	it('a student asking for someone else is 403 before any database read', async () => {
		await expect(getStudentAttendance('student-1', studentOther, query)).rejects.toMatchObject({
			code: 'FORBIDDEN',
			statusCode: 403,
		});
		expect(userFindUnique).not.toHaveBeenCalled();
		expect(attendanceFindMany).not.toHaveBeenCalled();
	});

	it('check order: role gate, then target lookup, then scope filter (a missing target never reaches the history query)', async () => {
		setTarget('missing id');
		await expect(getStudentAttendance('student-1', owningTeacher, query)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
		expect(attendanceFindMany).not.toHaveBeenCalled();
	});

	it('a teacher only ever queries rows from the courses they teach, and only live sessions', async () => {
		setTarget('student');
		await getStudentAttendance('student-1', owningTeacher, query);
		const where = attendanceFindMany.mock.calls[0]![0].where;
		expect(where).toEqual({
			userId: 'student-1',
			classSession: { deletedAt: null, course: { teacherId: 'teacher-1' } },
		});
		expect(attendanceCount.mock.calls[0]![0].where).toEqual(where);
	});

	it('a teacher with no rows in their courses gets an empty list, not a refusal', async () => {
		setTarget('student');
		attendanceFindMany.mockResolvedValueOnce([]);
		await expect(getStudentAttendance('student-1', otherTeacher, query)).resolves.toEqual({ records: [], total: 0 });
	});

	it.each([
		['owner', SUPER_ADMIN],
		['front desk', ADMIN],
		['student (self)', studentSelf],
	])('%s is not given the teacher course filter', async (_n, actor) => {
		setTarget('student');
		await getStudentAttendance('student-1', actor, query);
		expect(attendanceFindMany.mock.calls[0]![0].where).toEqual({
			userId: 'student-1',
			classSession: { deletedAt: null },
		});
	});

	it('the selected student fields carry neither email nor barcode', async () => {
		setTarget('student');
		await getStudentAttendance('student-1', ADMIN, query);
		const select = attendanceFindMany.mock.calls[0]![0].select;
		expect(select.user.select).toEqual({ id: true, name: true, indexNumber: true });
	});
});
