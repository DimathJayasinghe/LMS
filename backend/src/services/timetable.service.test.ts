import { describe, it, expect, vi, beforeEach } from 'vitest';

const { classSessionFindMany } = vi.hoisted(() => ({
	classSessionFindMany: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		classSession: { findMany: classSessionFindMany },
	},
}));

import { listPublicUpcoming } from './timetable.service';

beforeEach(() => {
	classSessionFindMany.mockReset().mockResolvedValue([]);
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
