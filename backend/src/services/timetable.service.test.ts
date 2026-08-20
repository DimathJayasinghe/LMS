import { Role } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { assertCourseAccess, classSessionFindMany, timetableSlotFindUnique, timetableSlotUpdate } = vi.hoisted(() => ({
	assertCourseAccess: vi.fn(),
	classSessionFindMany: vi.fn(),
	timetableSlotFindUnique: vi.fn(),
	timetableSlotUpdate: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		classSession: { findMany: classSessionFindMany },
		timetableSlot: {
			findUnique: timetableSlotFindUnique,
			update: timetableSlotUpdate,
		},
	},
}));

vi.mock('@/services/class.service', () => ({ assertCourseAccess }));

import { deleteSlot, listPublicUpcoming, updateSlot } from './timetable.service';

const teacher = { userId: 'teacher-1', role: Role.TEACHER };

beforeEach(() => {
	assertCourseAccess.mockReset().mockResolvedValue(undefined);
	classSessionFindMany.mockReset().mockResolvedValue([]);
	timetableSlotFindUnique.mockReset();
	timetableSlotUpdate.mockReset();
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
		timetableSlotFindUnique.mockResolvedValue({ id: 'slot-1', courseId: 'course-1' });
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
