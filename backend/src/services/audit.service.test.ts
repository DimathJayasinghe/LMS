import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findMany, count, create } = vi.hoisted(() => ({
	create: vi.fn().mockResolvedValue({}),
	findMany: vi.fn().mockResolvedValue([]),
	count: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/config/database', () => ({
	prisma: { auditLog: { findMany, count, create } },
}));

vi.mock('@/config/logger', () => ({
	logger: { debug: vi.fn(), error: vi.fn() },
}));

import { listAuditLogs, log, logInTransaction } from './audit.service';

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

describe('logInTransaction', () => {
	const input = {
		action: 'HALL_MARKS_ENTERED',
		targetType: 'Exam',
		targetId: 'exam-1',
		organizationId: 'org-1',
		metadata: { changed: 2 },
		context: { actorId: 'actor-1', actorRole: 'TEACHER', ip: '10.0.0.1', userAgent: 'test' },
	};

	it('writes through the transaction client, not the shared one', async () => {
		const txCreate = vi.fn().mockResolvedValue({});
		await logInTransaction({ auditLog: { create: txCreate } } as never, input);
		expect(txCreate).toHaveBeenCalledWith({
			data: {
				action: 'HALL_MARKS_ENTERED', description: null, targetType: 'Exam', targetId: 'exam-1', metadata: { changed: 2 },
				organizationId: 'org-1', ip: '10.0.0.1', userAgent: 'test', actorId: 'actor-1', actorRole: 'TEACHER',
			},
		});
		expect(create).not.toHaveBeenCalled();
	});

	it('throws when the write fails, so the surrounding transaction rolls back', async () => {
		const txCreate = vi.fn().mockRejectedValue(new Error('audit down'));
		await expect(logInTransaction({ auditLog: { create: txCreate } } as never, input)).rejects.toThrow('audit down');
	});

	it('leaves the tenant column to its default when no organization is given', async () => {
		const txCreate = vi.fn().mockResolvedValue({});
		const { organizationId: _omit, ...withoutOrganization } = input;
		void _omit;
		await logInTransaction({ auditLog: { create: txCreate } } as never, withoutOrganization);
		expect(txCreate.mock.calls[0]![0].data).not.toHaveProperty('organizationId');
	});
});

describe('log (fire-and-forget)', () => {
	it('never throws to the caller when the write fails', async () => {
		create.mockRejectedValueOnce(new Error('db down'));
		expect(() => log({ action: 'X', context: { actorId: 'a', actorRole: 'ADMIN' } })).not.toThrow();
		await new Promise((resolve) => setImmediate(resolve));
	});
});
