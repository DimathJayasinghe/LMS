import { Role } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	assertCourseAccess,
	classSessionFindMany,
	classSessionFindUnique,
	classSessionCreate,
	timetableSlotCreate,
	timetableSlotFindFirst,
	timetableSlotFindMany,
	timetableSlotFindUnique,
	timetableSlotUpdate,
} = vi.hoisted(() => ({
	assertCourseAccess: vi.fn(),
	classSessionFindMany: vi.fn(),
	classSessionFindUnique: vi.fn(),
	classSessionCreate: vi.fn(),
	timetableSlotCreate: vi.fn(),
	timetableSlotFindFirst: vi.fn(),
	timetableSlotFindMany: vi.fn(),
	timetableSlotFindUnique: vi.fn(),
	timetableSlotUpdate: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		classSession: { findMany: classSessionFindMany, findUnique: classSessionFindUnique, create: classSessionCreate },
		timetableSlot: {
			create: timetableSlotCreate,
			findFirst: timetableSlotFindFirst,
			findMany: timetableSlotFindMany,
			findUnique: timetableSlotFindUnique,
			update: timetableSlotUpdate,
		},
	},
}));

vi.mock('@/services/class.service', () => ({ assertCourseAccess }));

import {
	createSlot,
	deleteSlot,
	generateSessions,
	getSlotById,
	listPublicUpcoming,
	listSlots,
	listUpcomingSessions,
	previewGeneration,
	updateSlot,
} from './timetable.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER };

beforeEach(() => {
	assertCourseAccess.mockReset().mockResolvedValue({ id: 'course-1', teacherId: 'teacher-1' });
	classSessionFindMany.mockReset().mockResolvedValue([]);
	classSessionFindUnique.mockReset().mockResolvedValue(null);
	classSessionCreate.mockReset().mockResolvedValue({ id: 'session-1' });
	timetableSlotCreate.mockReset();
	timetableSlotFindFirst.mockReset();
	timetableSlotFindMany.mockReset().mockResolvedValue([]);
	timetableSlotFindUnique.mockReset();
	timetableSlotUpdate.mockReset();
});

describe('role-scoped timetable visibility', () => {
	it('scopes teachers to owned courses and lets them see inactive slots', async () => {
		await listSlots({}, teacher);
		expect(timetableSlotFindMany).toHaveBeenCalledWith(expect.objectContaining({
			where: { course: { teacherId: 'teacher-1' } },
		}));
	});

	it('scopes students to active enrollments', async () => {
		await listSlots({}, { userId: 'student-1', role: Role.STUDENT });
		const where = timetableSlotFindMany.mock.calls[0]![0].where;
		expect(where.isActive).toBe(true);
		expect(where.OR).toContainEqual({
			classType: 'ONLINE',
			course: { enrollments: { some: { userId: 'student-1', isActive: true, classType: 'ONLINE' } } },
		});
	});

	it('rejects marker timetable access', async () => {
		await expect(listSlots({}, { userId: 'marker-1', role: Role.MARKER })).rejects.toMatchObject({
			code: 'FORBIDDEN', statusCode: 403,
		});
		expect(timetableSlotFindMany).not.toHaveBeenCalled();
	});

	it('applies the same scope to a single slot lookup', async () => {
		timetableSlotFindFirst.mockResolvedValue(null);
		await expect(getSlotById('slot-1', teacher)).rejects.toMatchObject({ code: 'SLOT_NOT_FOUND' });
		expect(timetableSlotFindFirst).toHaveBeenCalledWith(expect.objectContaining({
			where: { id: 'slot-1', course: { teacherId: 'teacher-1' } },
		}));
	});
});

describe('conflict-aware slot authoring', () => {
	it('rejects overlapping slots for the same teacher', async () => {
		timetableSlotFindMany.mockResolvedValue([{
			startTime: '10:30', durationMinutes: 60, courseId: 'course-2', instituteId: null,
			course: { teacherId: 'teacher-1' },
		}]);
		await expect(createSlot({
			courseId: 'course-1', dayOfWeek: 1, startTime: '10:00', durationMinutes: 60,
		}, teacher)).rejects.toMatchObject({ code: 'TIMETABLE_CONFLICT', statusCode: 409 });
		expect(timetableSlotCreate).not.toHaveBeenCalled();
	});

	it('rejects same-course overlaps across modes', async () => {
		timetableSlotFindMany.mockResolvedValue([{
			startTime: '10:30', durationMinutes: 60, courseId: 'course-1', instituteId: null,
			classType: 'ONLINE', course: { teacherId: 'teacher-1' },
		}]);
		await expect(createSlot({ courseId: 'course-1', dayOfWeek: 1, startTime: '10:00', durationMinutes: 60, classType: 'PHYSICAL' }, teacher)).rejects.toMatchObject({ code: 'TIMETABLE_CONFLICT', statusCode: 409 });
	});

	it('allows adjacent slots and never persists a recurring Zoom link', async () => {
		timetableSlotFindMany.mockResolvedValue([{
			startTime: '11:00', durationMinutes: 60, courseId: 'course-2', instituteId: null,
			course: { teacherId: 'teacher-1' },
		}]);
		timetableSlotCreate.mockResolvedValue({ id: 'slot-1' });
		await createSlot({ courseId: 'course-1', dayOfWeek: 1, startTime: '10:00', durationMinutes: 60 }, teacher);
		const call = timetableSlotCreate.mock.calls[0]![0];
		expect(call.data).not.toHaveProperty('zoomLink');
		expect(call.select).not.toHaveProperty('zoomLink');
	});
});

describe('session preview, generation, and upcoming access', () => {
	const slot = {
		id: 'slot-1', title: null, dayOfWeek: 1, startTime: '10:00', durationMinutes: 60,
		classType: 'ONLINE', courseId: 'course-1', course: { name: 'Physics', year: 2026 },
	};

	it('previews create/existing occurrences without mutating sessions', async () => {
		timetableSlotFindMany.mockResolvedValue([slot]);
		classSessionFindUnique.mockResolvedValue(null);
		const result = await previewGeneration(
			new Date('2026-08-24T00:00:00.000Z'), new Date('2026-08-24T23:59:59.000Z'), teacher,
		);
		expect(result.createCount).toBe(1);
		expect(result.rows[0]?.status).toBe('CREATE');
		expect(classSessionCreate).not.toHaveBeenCalled();
		expect(timetableSlotFindMany.mock.calls[0]![0].where.course).toEqual({ teacherId: 'teacher-1' });
	});

	it('generates sessions without copying a reusable Zoom URL', async () => {
		timetableSlotFindMany.mockResolvedValue([slot]);
		await generateSessions(
			new Date('2026-08-24T00:00:00.000Z'), new Date('2026-08-24T23:59:59.000Z'), teacher,
		);
		const data = classSessionCreate.mock.calls[0]![0].data;
		expect(data).not.toHaveProperty('zoomLink');
		expect(data.timetableSlotId).toBe('slot-1');
	});

	it('skips the slots of a class whose teacher left, for the weekly job and for the preview alike', async () => {
		timetableSlotFindMany.mockResolvedValue([]);
		const from = new Date('2026-08-24T00:00:00.000Z');
		const to = new Date('2026-08-24T23:59:59.000Z');

		await generateSessions(from, to);
		await previewGeneration(from, to, { userId: 'owner-1', role: Role.SUPER_ADMIN });

		for (const call of timetableSlotFindMany.mock.calls) {
			expect(call[0].where).toMatchObject({ isActive: true, course: { teacher: { deletedAt: null, role: Role.TEACHER } } });
		}
	});

	it('returns only enrolled upcoming sessions to a student and exposes only scheduled state', async () => {
		classSessionFindMany.mockResolvedValue([{ id: 'session-1', zoomMeetingId: 'secret-id', title: 'Class' }]);
		const result = await listUpcomingSessions(
			{ from: new Date('2026-08-01'), to: new Date('2026-08-31') },
			{ userId: 'student-1', role: Role.STUDENT },
		);
		expect(classSessionFindMany.mock.calls[0]![0].where.AND[1].OR).toContainEqual({
			classType: 'ONLINE',
			course: { enrollments: { some: { userId: 'student-1', isActive: true, classType: 'ONLINE' } } },
		});
		expect(result[0]).toMatchObject({ id: 'session-1', liveScheduled: true });
		expect(result[0]).not.toHaveProperty('zoomMeetingId');
	});
});

describe('timetable slot lifecycle', () => {
	it('soft-disables a slot without deleting its generated-session relationship', async () => {
		timetableSlotFindUnique.mockResolvedValue({ id: 'slot-1', courseId: 'course-1' });
		timetableSlotUpdate.mockResolvedValue({ id: 'slot-1', isActive: false });

		await deleteSlot('slot-1', teacher);

		expect(assertCourseAccess).toHaveBeenCalledWith('course-1', teacher);
		expect(timetableSlotUpdate).toHaveBeenCalledWith({
			where: { id: 'slot-1' },
			data: { isActive: false },
		});
	});

	it('allows repeated disable requests with the same final state', async () => {
		timetableSlotFindUnique.mockResolvedValue({ id: 'slot-1', courseId: 'course-1' });
		timetableSlotUpdate.mockResolvedValue({ id: 'slot-1', isActive: false });

		await deleteSlot('slot-1', teacher);
		await deleteSlot('slot-1', teacher);

		expect(timetableSlotUpdate).toHaveBeenCalledTimes(2);
		expect(timetableSlotUpdate).toHaveBeenNthCalledWith(2, {
			where: { id: 'slot-1' },
			data: { isActive: false },
		});
	});

	it('rejects a missing slot before checking course ownership', async () => {
		timetableSlotFindUnique.mockResolvedValue(null);

		await expect(deleteSlot('missing-slot', teacher)).rejects.toMatchObject({
			code: 'SLOT_NOT_FOUND',
			statusCode: 404,
		});
		expect(assertCourseAccess).not.toHaveBeenCalled();
		expect(timetableSlotUpdate).not.toHaveBeenCalled();
	});

	it('does not disable a slot when course access is denied', async () => {
		timetableSlotFindUnique.mockResolvedValue({ id: 'slot-1', courseId: 'course-1' });
		assertCourseAccess.mockRejectedValue({ code: 'FORBIDDEN_COURSE', statusCode: 403 });

		await expect(deleteSlot('slot-1', teacher)).rejects.toMatchObject({
			code: 'FORBIDDEN_COURSE',
			statusCode: 403,
		});
		expect(timetableSlotUpdate).not.toHaveBeenCalled();
	});

	it('restores an inactive slot idempotently through the existing update path', async () => {
		timetableSlotFindUnique.mockResolvedValue({
			id: 'slot-1', courseId: 'course-1', instituteId: null, dayOfWeek: 1,
			startTime: '10:00', durationMinutes: 60, isActive: false,
		});
		timetableSlotUpdate.mockResolvedValue({ id: 'slot-1', isActive: true });

		await updateSlot('slot-1', { isActive: true }, teacher);
		await updateSlot('slot-1', { isActive: true }, teacher);

		expect(timetableSlotUpdate).toHaveBeenCalledTimes(2);
		expect(timetableSlotUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
			where: { id: 'slot-1' },
			data: expect.objectContaining({ isActive: true }),
		}));
	});
});

describe('listPublicUpcoming — public marketing-page timetable', () => {
	it('never selects live-class join credentials', async () => {
		// The one property this test exists to lock in: this endpoint has no
		// auth, so if the select list ever grows to include zoomLink /
		// zoomMeetingId / zoomPassword, anonymous visitors could join a live
		// class without being enrolled or paid.
		await listPublicUpcoming({});

		const call = classSessionFindMany.mock.calls[0]![0];
		expect(call.select).toMatchObject({
			id: true,
			title: true,
			date: true,
			durationMinutes: true,
			classType: true,
		});
		expect(call.select).not.toHaveProperty('zoomLink');
		expect(call.select).not.toHaveProperty('zoomMeetingId');
		expect(call.select).not.toHaveProperty('zoomPassword');
	});

	it('only includes non-deleted sessions on active courses', async () => {
		await listPublicUpcoming({});

		const call = classSessionFindMany.mock.calls[0]![0];
		expect(call.where.deletedAt).toBeNull();
		expect(call.where.course).toEqual({ isActive: true });
	});

	it('defaults to a 14-day window and a 20-item cap', async () => {
		const before = Date.now();
		await listPublicUpcoming({});
		const after = Date.now();

		const call = classSessionFindMany.mock.calls[0]![0];
		expect(call.take).toBe(20);

		const gte = (call.where.date.gte as Date).getTime();
		const lte = (call.where.date.lte as Date).getTime();
		expect(gte).toBeGreaterThanOrEqual(before);
		expect(gte).toBeLessThanOrEqual(after);
		expect(lte - gte).toBeCloseTo(14 * 24 * 60 * 60 * 1000, -3);
	});

	it('respects a custom days/limit window', async () => {
		await listPublicUpcoming({ days: 3, limit: 5 });

		const call = classSessionFindMany.mock.calls[0]![0];
		expect(call.take).toBe(5);
		const gte = (call.where.date.gte as Date).getTime();
		const lte = (call.where.date.lte as Date).getTime();
		expect(lte - gte).toBeCloseTo(3 * 24 * 60 * 60 * 1000, -3);
	});

	it('orders by date ascending', async () => {
		await listPublicUpcoming({});

		const call = classSessionFindMany.mock.calls[0]![0];
		expect(call.orderBy).toEqual({ date: 'asc' });
	});
});
