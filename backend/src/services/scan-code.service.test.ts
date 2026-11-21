import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const { userFindMany, studentBarcodeFindMany, lockSpy } = vi.hoisted(() => ({
	userFindMany: vi.fn(),
	studentBarcodeFindMany: vi.fn(),
	lockSpy: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		user: { findMany: userFindMany },
		studentBarcode: { findMany: studentBarcodeFindMany },
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
	} as unknown as Prisma.TransactionClient;
	return { tx, userFindFirst, barcodeFindFirst };
};

beforeEach(() => {
	userFindMany.mockReset().mockResolvedValue([]);
	studentBarcodeFindMany.mockReset().mockResolvedValue([]);
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
	it('404s when the code is held by nobody', async () => {
		await expect(resolveStudentByCode('NOPE')).rejects.toMatchObject({
			code: 'BARCODE_NOT_FOUND',
			statusCode: 404,
		});
	});

	it('looks up both tables with a case-insensitive equality on the trimmed code', async () => {
		await resolveStudentByCode('  nug-001 ').catch(() => undefined);

		expect(userFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { barcode: { equals: 'nug-001', mode: 'insensitive' } } }),
		);
		expect(studentBarcodeFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { barcode: { equals: 'nug-001', mode: 'insensitive' } } }),
		);
	});

	it('resolves a code held only as a User.barcode, with no institute', async () => {
		userFindMany.mockResolvedValue([student('u1')]);

		await expect(resolveStudentByCode('LMS-000001')).resolves.toEqual({
			student: student('u1'),
			instituteId: null,
			matchedBarcode: 'LMS-000001',
		});
	});

	it('resolves a code held by one StudentBarcode row and reports its institute', async () => {
		studentBarcodeFindMany.mockResolvedValue([{ instituteId: 'inst-1', user: student('u1') }]);

		await expect(resolveStudentByCode('NUG-001')).resolves.toMatchObject({
			student: { id: 'u1' },
			instituteId: 'inst-1',
		});
	});

	it('resolves the same student held in both tables (one distinct student)', async () => {
		userFindMany.mockResolvedValue([student('u1')]);
		studentBarcodeFindMany.mockResolvedValue([{ instituteId: 'inst-1', user: student('u1') }]);

		await expect(resolveStudentByCode('X-1')).resolves.toMatchObject({
			student: { id: 'u1' },
			instituteId: 'inst-1',
		});
	});

	it('reports no institute when the same student holds the code at two institutes', async () => {
		studentBarcodeFindMany.mockResolvedValue([
			{ instituteId: 'inst-1', user: student('u1') },
			{ instituteId: 'inst-2', user: student('u1') },
		]);

		await expect(resolveStudentByCode('X-1')).resolves.toMatchObject({
			student: { id: 'u1' },
			instituteId: null,
		});
	});

	it.each([
		[
			'User.barcode of one student and StudentBarcode of another',
			[student('u1')],
			[{ instituteId: 'inst-1', user: student('u2') }],
		],
		[
			'two StudentBarcode rows of different students at different institutes',
			[],
			[
				{ instituteId: 'inst-1', user: student('u1') },
				{ instituteId: 'inst-2', user: student('u2') },
			],
		],
		[
			'two StudentBarcode rows of different students at the same institute',
			[],
			[
				{ instituteId: 'inst-1', user: student('u1') },
				{ instituteId: 'inst-1', user: student('u2') },
			],
		],
		['case-variant User.barcode duplicates', [student('u1'), student('u2')], []],
	])('never picks a winner: %s is ambiguous', async (_name, users, rows) => {
		userFindMany.mockResolvedValue(users);
		studentBarcodeFindMany.mockResolvedValue(rows);

		await expect(resolveStudentByCode('DUP')).rejects.toMatchObject({
			code: 'AMBIGUOUS_CODE',
			statusCode: 409,
		});
	});

	it('does not name the other holders in the ambiguity message', async () => {
		userFindMany.mockResolvedValue([student('u1'), student('u2')]);

		const err = (await resolveStudentByCode('DUP').then(() => null, (e: unknown) => e)) as Error;
		expect(err.message).not.toMatch(/u1|u2|Student/);
		expect(err.message).toMatch(/index number or name/i);
	});

	it('counts a deactivated or non-student holder as a holder (ambiguity is about the code, not the state)', async () => {
		userFindMany.mockResolvedValue([student('u1'), student('t1', { role: Role.TEACHER })]);
		await expect(resolveStudentByCode('DUP')).rejects.toMatchObject({ code: 'AMBIGUOUS_CODE' });

		userFindMany.mockResolvedValue([student('u1'), student('u3', { deletedAt: new Date() })]);
		await expect(resolveStudentByCode('DUP')).rejects.toMatchObject({ code: 'AMBIGUOUS_CODE' });
	});

	it('returns a lone deactivated or non-student holder so the caller keeps its own refusal codes', async () => {
		userFindMany.mockResolvedValue([student('u1', { deletedAt: new Date('2026-01-01') })]);
		await expect(resolveStudentByCode('A-1')).resolves.toMatchObject({
			student: { id: 'u1', deletedAt: new Date('2026-01-01') },
		});

		userFindMany.mockResolvedValue([student('t1', { role: Role.TEACHER })]);
		await expect(resolveStudentByCode('A-2')).resolves.toMatchObject({
			student: { id: 't1', role: Role.TEACHER },
		});
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

	it('checks both tables case-insensitively and excludes the caller from the match', async () => {
		const { tx, userFindFirst, barcodeFindFirst } = makeTx();

		await assertScanCodeFree(tx, 'Nug-001', { exceptUserId: 'u1' });

		expect(userFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { barcode: { equals: 'Nug-001', mode: 'insensitive' }, id: { not: 'u1' } },
			}),
		);
		expect(barcodeFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { barcode: { equals: 'Nug-001', mode: 'insensitive' }, userId: { not: 'u1' } },
			}),
		);
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

		userFindFirst.mockResolvedValue({ id: 'squatter' });
		await expect(
			assertScanCodeFree(tx, 'LMS-000123', { exceptUserId: 'u1', allowLmsFormat: true }),
		).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
	});

	it('works without an excluded user (nobody is the caller)', async () => {
		const { tx, userFindFirst, barcodeFindFirst } = makeTx();
		await assertScanCodeFree(tx, 'NUG-001', {});
		expect(userFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { barcode: { equals: 'NUG-001', mode: 'insensitive' } } }),
		);
		expect(barcodeFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({ where: { barcode: { equals: 'NUG-001', mode: 'insensitive' } } }),
		);
	});
});
