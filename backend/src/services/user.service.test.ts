import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';

const {
	findUnique,
	update,
	instituteFindUnique,
	studentBarcodeFindUnique,
	studentBarcodeCreate,
	transaction,
	assertScanCodeFree,
	resolveStudentByCode,
} = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
	instituteFindUnique: vi.fn(),
	studentBarcodeFindUnique: vi.fn(),
	studentBarcodeCreate: vi.fn(),
	transaction: vi.fn(),
	assertScanCodeFree: vi.fn(),
	resolveStudentByCode: vi.fn(),
}));

const txClient = {
	user: { findUnique, update },
	institute: { findUnique: instituteFindUnique },
	studentBarcode: { findUnique: studentBarcodeFindUnique, create: studentBarcodeCreate },
};

vi.mock('@/config/database', () => ({
	prisma: {
		user: { findUnique, update },
		institute: { findUnique: instituteFindUnique },
		studentBarcode: { findUnique: studentBarcodeFindUnique, create: studentBarcodeCreate },
		$transaction: transaction,
	},
}));

vi.mock('@/services/scan-code.service', () => ({ assertScanCodeFree, resolveStudentByCode }));

import {
	updateStatus,
	assignBarcode,
	createMyInstituteBarcode,
	resolveStudentByBarcode,
} from './user.service';

const baseUser = (overrides: Partial<{ id: string; role: Role; barcode: string | null }> = {}) => ({
	id: 'target-id',
	indexNumber: 5,
	role: Role.STUDENT,
	barcode: null,
	...overrides,
});

const unavailable = () => new AppError('CODE_UNAVAILABLE', 409, 'This code is unavailable.');

beforeEach(() => {
	findUnique.mockReset();
	update.mockReset();
	instituteFindUnique.mockReset();
	studentBarcodeFindUnique.mockReset();
	studentBarcodeCreate.mockReset();
	transaction.mockReset().mockImplementation(async (callback: (tx: typeof txClient) => unknown) => callback(txClient));
	assertScanCodeFree.mockReset().mockResolvedValue(undefined);
	resolveStudentByCode.mockReset();
});

describe('updateStatus — privileged-target guard', () => {
	it('blocks an ADMIN actor from deactivating a SUPER_ADMIN target', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ role: Role.SUPER_ADMIN }));

		await expect(
			updateStatus('target-id', { isActive: false }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(update).not.toHaveBeenCalled();
	});

	it('blocks an ADMIN actor from deactivating another ADMIN target (peer)', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ role: Role.ADMIN }));

		await expect(
			updateStatus('target-id', { isActive: false }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(update).not.toHaveBeenCalled();
	});

	it('allows an ADMIN actor to deactivate a STUDENT target', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ role: Role.STUDENT }));
		update.mockResolvedValueOnce(baseUser({ role: Role.STUDENT }));

		await updateStatus('target-id', { isActive: false }, Role.ADMIN);
		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
		);
	});

	it('allows an ADMIN actor to deactivate a TEACHER or MARKER target', async () => {
		for (const role of [Role.TEACHER, Role.MARKER]) {
			findUnique.mockResolvedValueOnce(baseUser({ role }));
			update.mockResolvedValueOnce(baseUser({ role }));

			await updateStatus('target-id', { isActive: false }, Role.ADMIN);
		}
		expect(update).toHaveBeenCalledTimes(2);
	});

	it('allows a SUPER_ADMIN actor to deactivate a SUPER_ADMIN or ADMIN target', async () => {
		for (const role of [Role.SUPER_ADMIN, Role.ADMIN]) {
			findUnique.mockResolvedValueOnce(baseUser({ role }));
			update.mockResolvedValueOnce(baseUser({ role }));

			await updateStatus('target-id', { isActive: false }, Role.SUPER_ADMIN);
		}
		expect(update).toHaveBeenCalledTimes(2);
	});

	it('still 404s for a missing target, before the privilege check runs', async () => {
		findUnique.mockResolvedValueOnce(null);

		await expect(
			updateStatus('missing-id', { isActive: false }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
		expect(update).not.toHaveBeenCalled();
	});
});

describe('assignBarcode — privileged-target guard and code uniqueness', () => {
	it('blocks an ADMIN actor from reassigning a SUPER_ADMIN target\'s barcode', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ role: Role.SUPER_ADMIN }));

		await expect(
			assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(update).not.toHaveBeenCalled();
	});

	it('the privilege check runs before the code-uniqueness check', async () => {
		// Target is privileged AND the code is already taken — must fail with FORBIDDEN (403),
		// not CODE_UNAVAILABLE (409): an ADMIN shouldn't learn anything about code collisions
		// on an account they can't touch.
		findUnique.mockResolvedValueOnce(baseUser({ role: Role.SUPER_ADMIN }));
		assertScanCodeFree.mockRejectedValue(unavailable());

		await expect(
			assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(assertScanCodeFree).not.toHaveBeenCalled();
	});

	it('allows an ADMIN actor to assign a barcode to a STUDENT target, checking the code under the lock first', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ role: Role.STUDENT }));
		update.mockResolvedValueOnce(baseUser({ role: Role.STUDENT, barcode: 'BC-1' }));

		await assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN);

		expect(assertScanCodeFree).toHaveBeenCalledWith(txClient, 'BC-1', { exceptUserId: 'target-id' });
		expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { barcode: 'BC-1' } }));
		expect(assertScanCodeFree.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]!);
	});

	it('runs the check and the write in one transaction', async () => {
		findUnique.mockResolvedValueOnce(baseUser());
		update.mockResolvedValueOnce(baseUser({ barcode: 'BC-1' }));

		await assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN);

		expect(transaction).toHaveBeenCalledTimes(1);
	});

	it('rejects a code another student holds (as an LMS card or an institute card) and writes nothing', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ role: Role.STUDENT }));
		assertScanCodeFree.mockRejectedValue(unavailable());

		await expect(
			assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE', statusCode: 409, message: 'This code is unavailable.' });
		expect(update).not.toHaveBeenCalled();
	});

	it('still 404s for a missing target before any code check', async () => {
		findUnique.mockResolvedValueOnce(null);

		await expect(
			assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
		expect(assertScanCodeFree).not.toHaveBeenCalled();
	});

	it('checks an already-held code and allows the user’s own default card', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ barcode: 'LMS-000005' }));
		await assignBarcode('target-id', { barcode: 'lms-000005' }, Role.ADMIN);
		expect(assertScanCodeFree).toHaveBeenCalledWith(txClient, 'lms-000005', { exceptUserId: 'target-id', allowLmsFormat: true });
	});

	it('checks a restored default card', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ barcode: 'CUSTOM-1' }));
		await assignBarcode('target-id', { barcode: 'LMS-000005' }, Role.ADMIN);
		expect(assertScanCodeFree).toHaveBeenCalledWith(txClient, 'LMS-000005', { exceptUserId: 'target-id', allowLmsFormat: true });
	});

	it('checks a case variant of another user’s code', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ barcode: 'OTHER' }));
		assertScanCodeFree.mockRejectedValue(unavailable());
		await expect(assignBarcode('target-id', { barcode: 'bc-1' }, Role.ADMIN)).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
		expect(update).not.toHaveBeenCalled();
	});

});

describe('createMyInstituteBarcode — code uniqueness', () => {
	const input = { instituteId: 'inst-1', barcode: 'NUG-001' };
	const created = { id: 'b1', barcode: 'NUG-001', instituteId: 'inst-1' };

	beforeEach(() => {
		instituteFindUnique.mockResolvedValue({ id: 'inst-1', isActive: true });
		studentBarcodeFindUnique.mockResolvedValue(null);
		studentBarcodeCreate.mockResolvedValue(created);
	});

	it('checks the code under the lock, in the same transaction as the insert', async () => {
		await createMyInstituteBarcode('u1', input);

		expect(transaction).toHaveBeenCalledTimes(1);
		expect(assertScanCodeFree).toHaveBeenCalledWith(txClient, 'NUG-001', { exceptUserId: 'u1' });
		expect(studentBarcodeCreate).toHaveBeenCalledWith(
			expect.objectContaining({ data: { userId: 'u1', instituteId: 'inst-1', barcode: 'NUG-001' } }),
		);
		expect(assertScanCodeFree.mock.invocationCallOrder[0]).toBeLessThan(
			studentBarcodeCreate.mock.invocationCallOrder[0]!,
		);
	});

	it.each([
		['another student\'s LMS card', 'LMS-000042'],
		['another student\'s institute card at a different institute', 'NUG-001'],
		['the reserved card format', 'LMS-999999'],
	])('rejects a code that is %s and writes nothing', async (_name, barcode) => {
		assertScanCodeFree.mockRejectedValue(unavailable());

		await expect(createMyInstituteBarcode('u1', { ...input, barcode })).rejects.toMatchObject({
			code: 'CODE_UNAVAILABLE',
			statusCode: 409,
		});
		expect(studentBarcodeCreate).not.toHaveBeenCalled();
	});

	it('keeps the own-code refusal ahead of the uniqueness check', async () => {
		studentBarcodeFindUnique.mockResolvedValueOnce({ id: 'mine' });

		await expect(createMyInstituteBarcode('u1', input)).rejects.toMatchObject({
			code: 'STUDENT_BARCODE_EXISTS',
			statusCode: 409,
		});
		expect(assertScanCodeFree).not.toHaveBeenCalled();
	});

	it('404s for an inactive institute before anything else', async () => {
		instituteFindUnique.mockResolvedValue({ id: 'inst-1', isActive: false });

		await expect(createMyInstituteBarcode('u1', input)).rejects.toMatchObject({
			code: 'INSTITUTE_NOT_FOUND',
			statusCode: 404,
		});
		expect(assertScanCodeFree).not.toHaveBeenCalled();
	});

	it('runs the guard before the write inside one transaction', async () => {
		await createMyInstituteBarcode('u1', input);
		expect(transaction).toHaveBeenCalledTimes(1);
		expect(assertScanCodeFree).toHaveBeenCalledWith(txClient, input.barcode, { exceptUserId: 'u1' });
		expect(assertScanCodeFree.mock.invocationCallOrder[0]).toBeLessThan(studentBarcodeCreate.mock.invocationCallOrder[0]!);
	});

});

describe('resolveStudentByBarcode', () => {
	const holder = { id: 'u1', name: 'Nimal Perera', indexNumber: 42, role: Role.STUDENT, deletedAt: null };

	it('returns the resolved student without role or state, plus institute and scanned code', async () => {
		resolveStudentByCode.mockResolvedValue({ student: holder, instituteId: 'inst-1', matchedBarcode: 'NUG-001' });

		const result = await resolveStudentByBarcode('NUG-001');

		expect(result).toEqual({
			user: { id: 'u1', name: 'Nimal Perera', indexNumber: 42 },
			instituteId: 'inst-1',
			matchedBarcode: 'NUG-001',
		});
		expect(resolveStudentByCode).toHaveBeenCalledWith('NUG-001');
	});

	it('keeps the desk lookup behaviour for a deactivated or non-student holder (returned as before)', async () => {
		resolveStudentByCode.mockResolvedValue({
			student: { ...holder, role: Role.TEACHER, deletedAt: new Date() },
			instituteId: null,
			matchedBarcode: 'LMS-000042',
		});

		await expect(resolveStudentByBarcode('LMS-000042')).resolves.toMatchObject({
			user: { id: 'u1' },
			instituteId: null,
		});
	});

	it.each([
		['AMBIGUOUS_CODE', 409],
		['BARCODE_NOT_FOUND', 404],
	])('passes %s through unchanged', async (code, statusCode) => {
		resolveStudentByCode.mockRejectedValue(new AppError(code, statusCode, 'x'));

		await expect(resolveStudentByBarcode('DUP')).rejects.toMatchObject({ code, statusCode });
	});
});
