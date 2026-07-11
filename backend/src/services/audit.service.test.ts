import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findMany, count } = vi.hoisted(() => ({
	findMany: vi.fn().mockResolvedValue([]),
	count: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/config/database', () => ({
	prisma: { auditLog: { findMany, count } },
}));

vi.mock('@/config/logger', () => ({
	logger: { debug: vi.fn(), error: vi.fn() },
}));

import { listAuditLogs } from './audit.service';

const baseQuery = { page: 1, limit: 20 } as const;

beforeEach(() => {
	findMany.mockClear();
	count.mockClear();
});

describe('listAuditLogs — filter construction', () => {
	it('builds an empty where clause with no optional filters', async () => {
		await listAuditLogs(baseQuery);
		expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
		expect(count).toHaveBeenCalledWith({ where: {} });
	});

	it('filters by action alone', async () => {
		await listAuditLogs({ ...baseQuery, action: 'USER_DEACTIVATED' });
		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { action: 'USER_DEACTIVATED' } }),
		);
	});

	it('filters by actorId alone', async () => {
		await listAuditLogs({ ...baseQuery, actorId: 'actor-1' });
		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { actorId: 'actor-1' } }),
		);
	});

	it('combines targetType and targetId', async () => {
		await listAuditLogs({ ...baseQuery, targetType: 'User', targetId: 'user-1' });
		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { targetType: 'User', targetId: 'user-1' } }),
		);
	});

	it('applies only a lower bound when "from" is given without "to"', async () => {
		const from = new Date('2026-01-01');
		await listAuditLogs({ ...baseQuery, from });
		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { createdAt: { gte: from } } }),
		);
	});

	it('applies only an upper bound when "to" is given without "from"', async () => {
		const to = new Date('2026-01-31');
		await listAuditLogs({ ...baseQuery, to });
		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { createdAt: { lte: to } } }),
		);
	});

	it('applies both bounds when "from" and "to" are both given', async () => {
		const from = new Date('2026-01-01');
		const to = new Date('2026-01-31');
		await listAuditLogs({ ...baseQuery, from, to });
		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { createdAt: { gte: from, lte: to } } }),
		);
	});

	it('computes skip from page and limit for pagination beyond page 1', async () => {
		await listAuditLogs({ page: 3, limit: 10 });
		expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }));
	});

	it('orders by createdAt descending (newest first)', async () => {
		await listAuditLogs(baseQuery);
		expect(findMany).toHaveBeenCalledWith(
			expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
		);
	});
});
