import { describe, it, expect, vi, beforeEach } from 'vitest';

const { courseFindMany, courseFindFirst } = vi.hoisted(() => ({
	courseFindMany: vi.fn(),
	courseFindFirst: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		course: { findMany: courseFindMany, findFirst: courseFindFirst },
	},
}));

import { getClassById, listClasses, listPublicClasses } from './class.service';
import { Role } from '@prisma/client';

beforeEach(() => {
	courseFindMany.mockReset().mockResolvedValue([]);
	courseFindFirst.mockReset();
});

describe('teacher class visibility', () => {
	it('scopes the class list to the acting teacher', async () => {
		await listClasses({}, { userId: 'teacher-1', role: Role.TEACHER });

		expect(courseFindMany.mock.calls[0]![0].where).toMatchObject({
			teacherId: 'teacher-1',
			isActive: true,
		});
	});

	it('rejects direct access to another teacher\'s class', async () => {
		courseFindFirst.mockResolvedValueOnce({
			id: 'course-2',
			teacherId: 'teacher-2',
			isActive: true,
		});

		await expect(
			getClassById('course-2', { userId: 'teacher-1', role: Role.TEACHER }),
		).rejects.toMatchObject({ code: 'FORBIDDEN_COURSE', statusCode: 403 });
	});
});

describe('listPublicClasses — public marketing-page course listing', () => {
	it('only returns active courses, regardless of query filters', async () => {
		await listPublicClasses({});

		const call = courseFindMany.mock.calls[0]![0];
		expect(call.where.isActive).toBe(true);
	});

	it('never selects PII (email/phone/NIC) or enrollment data', async () => {
		await listPublicClasses({});

		const call = courseFindMany.mock.calls[0]![0];
		expect(call.select).toMatchObject({
			id: true,
			name: true,
			year: true,
			description: true,
			monthlyFee: true,
			bannerUrl: true,
			backdropUrl: true,
		});
		expect(call.select).not.toHaveProperty('enrollments');
		expect(call.select.teacher).toEqual({ select: { name: true } });
	});

	it('applies search and year filters when provided', async () => {
		await listPublicClasses({ search: 'physics', year: 2027 });

		const call = courseFindMany.mock.calls[0]![0];
		expect(call.where.year).toBe(2027);
		expect(call.where.OR).toEqual([
			{ name: { contains: 'physics', mode: 'insensitive' } },
			{ description: { contains: 'physics', mode: 'insensitive' } },
		]);
	});
});
