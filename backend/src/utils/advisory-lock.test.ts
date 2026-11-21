import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { withAdvisoryLock } from './advisory-lock';

const makeTx = () => {
	const executeRaw = vi.fn().mockResolvedValue(1);
	return { tx: { $executeRaw: executeRaw } as unknown as Prisma.TransactionClient, executeRaw };
};

describe('withAdvisoryLock', () => {
	it('takes a transaction-scoped lock keyed by namespace, organization and key', async () => {
		const { tx, executeRaw } = makeTx();

		await withAdvisoryLock(tx, 'scan-code', 'org-1', 'ABC-1');

		expect(executeRaw).toHaveBeenCalledTimes(1);
		const query = executeRaw.mock.calls[0]![0] as Prisma.Sql;
		expect(query.strings.join('?')).toContain('pg_advisory_xact_lock(hashtextextended(');
		expect(query.values).toEqual(['scan-code:org-1:ABC-1']);
	});

	it('keeps different namespaces apart so it cannot collide with the existing per-id locks', async () => {
		const a = makeTx();
		const b = makeTx();

		await withAdvisoryLock(a.tx, 'scan-code', 'org-1', 'same-key');
		await withAdvisoryLock(b.tx, 'other-feature', 'org-1', 'same-key');

		const keyA = (a.executeRaw.mock.calls[0]![0] as Prisma.Sql).values[0];
		const keyB = (b.executeRaw.mock.calls[0]![0] as Prisma.Sql).values[0];
		expect(keyA).not.toEqual(keyB);
		expect(keyA).not.toEqual('same-key');
	});

	it('keeps different organizations apart', async () => {
		const a = makeTx();
		const b = makeTx();

		await withAdvisoryLock(a.tx, 'scan-code', 'org-1', 'K');
		await withAdvisoryLock(b.tx, 'scan-code', 'org-2', 'K');

		expect((a.executeRaw.mock.calls[0]![0] as Prisma.Sql).values[0]).not.toEqual(
			(b.executeRaw.mock.calls[0]![0] as Prisma.Sql).values[0],
		);
	});
});
