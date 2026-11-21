import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const { lockSpy, queryRaw } = vi.hoisted(() => ({
	lockSpy: vi.fn(),
	queryRaw: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		$queryRaw: queryRaw,
	},
}));

vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: lockSpy }));

import {
	LMS_CODE_PATTERN,
	assertScanCodeFree,
	normalizeScanCode,
	resolveStudentByCode,
} from './scan-code.service';

const student = (id: string, over: Partial<{ role: Role; deletedAt: Date | null }> = {}) => ({
	id,
	name: `Student ${id}`,
	indexNumber: 1,
	role: Role.STUDENT,
	deletedAt: null,
	...over,
});

const makeTx = () => {
	const userFindFirst = vi.fn().mockResolvedValue(null);
	const barcodeFindFirst = vi.fn().mockResolvedValue(null);
	const tx = {
		user: { findFirst: userFindFirst },
		studentBarcode: { findFirst: barcodeFindFirst },
		$queryRaw: vi.fn().mockImplementation(async (sql: TemplateStringsArray) => {
			const row = await (sql.join('').includes('StudentBarcode') ? barcodeFindFirst() : userFindFirst());
			return row ? [row] : [];
		}),
	} as unknown as Prisma.TransactionClient;
	return { tx, userFindFirst, barcodeFindFirst };
};

beforeEach(() => {
	queryRaw.mockReset().mockResolvedValue([]);
	lockSpy.mockReset().mockResolvedValue(undefined);
});

describe('normalizeScanCode', () => {
	it('trims surrounding whitespace and keeps the case', () => {
		expect(normalizeScanCode('  Abc-1 \n')).toBe('Abc-1');
	});
});

describe('LMS_CODE_PATTERN', () => {
	it.each(['LMS-000001', 'lms-42', 'LMS-1'])('treats %s as the reserved card format', (v) => {
		expect(LMS_CODE_PATTERN.test(v)).toBe(true);
	});
	it.each(['LMS-', 'LMSX-1', 'XLMS-1', 'LMS-1A', 'NUG-001'])('does not reserve %s', (v) => {
		expect(LMS_CODE_PATTERN.test(v)).toBe(false);
	});
});

describe('resolveStudentByCode', () => {
	const user = (id: string, over: Partial<{ role: Role; deletedAt: Date | null }> = {}) => ({
		kind: 'USER', instituteId: null, ...student(id, over),
	});
	const card = (id: string, instituteId: string) => ({ kind: 'CARD', instituteId, ...student(id) });

	it.each(['A_1', '50%', 'END\\'])('binds %s unchanged in both exact comparisons in one query', async (code) => {
		await expect(resolveStudentByCode(code)).rejects.toMatchObject({ code: 'BARCODE_NOT_FOUND' });
		expect(queryRaw).toHaveBeenCalledTimes(1);
		const [strings, ...values] = queryRaw.mock.calls[0]!;
		const sql = strings.join('?');
		expect(sql.match(/upper\((?:\w+\.)?"barcode"\)\s*=\s*upper\(\?\)/gi)).toHaveLength(2);
		expect(sql).toMatch(/UNION ALL/i);
		expect(values).toEqual([code, code]);
	});

	it('returns a user holder with normalized input and no institute', async () => {
		queryRaw.mockResolvedValue([user('u1')]);
		await expect(resolveStudentByCode('  lms-1 ')).resolves.toEqual({
			student: student('u1'), instituteId: null, matchedBarcode: 'lms-1',
		});
	});

	it('reports the institute for one card, including a user match for the same holder', async () => {
		queryRaw.mockResolvedValue([user('u1'), card('u1', 'inst-1')]);
		await expect(resolveStudentByCode('x')).resolves.toMatchObject({ student: student('u1'), instituteId: 'inst-1' });
		queryRaw.mockResolvedValue([card('u1', 'inst-1')]);
		await expect(resolveStudentByCode('x')).resolves.toMatchObject({ student: student('u1'), instituteId: 'inst-1' });
	});

	it('returns no institute for two cards of the same holder', async () => {
		queryRaw.mockResolvedValue([card('u1', 'inst-1'), card('u1', 'inst-2')]);
		await expect(resolveStudentByCode('x')).resolves.toMatchObject({ instituteId: null });
	});

	it.each([
		[user('u1'), card('u2', 'inst-1')],
		[card('u1', 'inst-1'), card('u2', 'inst-2')],
		[card('u1', 'inst-1'), card('u2', 'inst-1')],
		[user('u1'), user('u2')],
		[user('u1'), user('t1', { role: Role.TEACHER })],
		[user('u1'), user('u3', { deletedAt: new Date('2026-01-01') })],
	])('rejects distinct holders, including case variants and inactive holders', async (...rows) => {
		queryRaw.mockResolvedValue(rows);
		const error = await resolveStudentByCode('DUP').then(() => null, (e: unknown) => e);
		expect(error).toMatchObject({ code: 'AMBIGUOUS_CODE', statusCode: 409 });
		expect((error as Error).message).not.toMatch(/u1|u2|Student/);
	});

	it.each([
		{ role: Role.TEACHER },
		{ deletedAt: new Date('2026-01-01') },
	])('returns a lone holder for the caller to validate', async (over) => {
		queryRaw.mockResolvedValue([user('u1', over)]);
		await expect(resolveStudentByCode('x')).resolves.toMatchObject({ student: student('u1', over) });
	});
});

describe('assertScanCodeFree', () => {
	it('takes the namespaced lock on the upper-cased trimmed code before reading', async () => {
		const { tx, userFindFirst } = makeTx();
		lockSpy.mockImplementation(async () => {
			expect(userFindFirst).not.toHaveBeenCalled();
		});

		await assertScanCodeFree(tx, '  nug-001 ', { exceptUserId: 'u1' });

		expect(lockSpy).toHaveBeenCalledWith(
			tx,
			'scan-code',
			'00000000-0000-4000-8000-000000000001',
			'NUG-001',
		);
	});

	it('passes when nobody else holds the code in either table', async () => {
		const { tx } = makeTx();
		await expect(assertScanCodeFree(tx, 'NUG-001', { exceptUserId: 'u1' })).resolves.toBeUndefined();
	});

	it.each(['A_1', '50%', 'END\\'])('compares and excludes the caller for %s', async (code) => {
		const { tx } = makeTx();
		await assertScanCodeFree(tx, code, { exceptUserId: 'u1' });
		const calls = vi.mocked(tx.$queryRaw).mock.calls;
		expect(calls).toHaveLength(2);
		for (const [strings, ...values] of calls) {
			expect((strings as TemplateStringsArray).join('?')).toMatch(/upper\("barcode"\)\s*=\s*upper\(\?\)/i);
			expect(values).toEqual([code, 'u1', 'u1']);
		}
	});

	it('rejects a code another user holds as User.barcode with a generic message', async () => {
		const { tx, userFindFirst } = makeTx();
		userFindFirst.mockResolvedValue({ id: 'other' });

		const err = await assertScanCodeFree(tx, 'LMS-X', { exceptUserId: 'u1' }).catch((e: unknown) => e);
		expect(err).toMatchObject({ code: 'CODE_UNAVAILABLE', statusCode: 409, message: 'This code is unavailable.' });
	});

	it('rejects a code another user holds as an institute code at any institute', async () => {
		const { tx, barcodeFindFirst } = makeTx();
		barcodeFindFirst.mockResolvedValue({ id: 'b1' });

		await expect(assertScanCodeFree(tx, 'NUG-001', { exceptUserId: 'u1' })).rejects.toMatchObject({
			code: 'CODE_UNAVAILABLE',
			statusCode: 409,
		});
	});

	it.each(['LMS-000123', 'lms-7', 'Lms-42'])('rejects the reserved card format %s for ordinary writers', async (code) => {
		const { tx, userFindFirst } = makeTx();

		await expect(assertScanCodeFree(tx, code, { exceptUserId: 'u1' })).rejects.toMatchObject({
			code: 'CODE_UNAVAILABLE',
			statusCode: 409,
		});
		expect(userFindFirst).not.toHaveBeenCalled();
	});

	it('lets the card writer use the reserved format, still checking for a collision', async () => {
		const { tx, userFindFirst } = makeTx();
		await expect(
			assertScanCodeFree(tx, 'LMS-000123', { exceptUserId: 'u1', allowLmsFormat: true }),
		).resolves.toBeUndefined();

		userFindFirst.mockResolvedValue({ id: 'other-holder' });
		await expect(
			assertScanCodeFree(tx, 'LMS-000123', { exceptUserId: 'u1', allowLmsFormat: true }),
		).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
	});

	it('works without an excluded user (nobody is the caller)', async () => {
		const { tx } = makeTx();
		await assertScanCodeFree(tx, 'NUG-001', {});
		for (const [, ...values] of vi.mocked(tx.$queryRaw).mock.calls) {
			expect(values).toEqual(['NUG-001', '', '']);
		}
	});

});
