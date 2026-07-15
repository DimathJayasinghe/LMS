import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const { findUnique, update, studentBarcodeFindMany } = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
	studentBarcodeFindMany: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		user: { findUnique, update },
		studentBarcode: { findMany: studentBarcodeFindMany },
	},
}));

import { updateStatus, assignBarcode, resolveStudentByBarcode } from './user.service';

const baseUser = (overrides: Partial<{ id: string; role: Role; barcode: string | null }> = {}) => ({
	id: 'target-id',
	role: Role.STUDENT,
	barcode: null,
	...overrides,
});

beforeEach(() => {
	findUnique.mockReset();
	update.mockReset();
	studentBarcodeFindMany.mockReset();
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

describe('assignBarcode — privileged-target guard', () => {
	it('blocks an ADMIN actor from reassigning a SUPER_ADMIN target\'s barcode', async () => {
		findUnique.mockResolvedValueOnce(baseUser({ role: Role.SUPER_ADMIN }));

		await expect(
			assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
		expect(update).not.toHaveBeenCalled();
	});

	it('the privilege check runs before the barcode-uniqueness check', async () => {
		// Target is privileged AND the barcode is already taken — must fail
		// with FORBIDDEN (403), not BARCODE_IN_USE (409): an ADMIN shouldn't
		// learn anything about barcode collisions on an account they can't touch.
		findUnique
			.mockResolvedValueOnce(baseUser({ role: Role.SUPER_ADMIN }))
			.mockResolvedValueOnce(baseUser({ id: 'someone-else', role: Role.STUDENT, barcode: 'BC-1' }));

		await expect(
			assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
	});

	it('allows an ADMIN actor to assign a barcode to a STUDENT target', async () => {
		findUnique
			.mockResolvedValueOnce(baseUser({ role: Role.STUDENT }))
			.mockResolvedValueOnce(null);
		update.mockResolvedValueOnce(baseUser({ role: Role.STUDENT, barcode: 'BC-1' }));

		await assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN);
		expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { barcode: 'BC-1' } }));
	});

	it('still rejects a barcode already in use by a different non-privileged user', async () => {
		findUnique
			.mockResolvedValueOnce(baseUser({ role: Role.STUDENT }))
			.mockResolvedValueOnce(baseUser({ id: 'someone-else', role: Role.STUDENT, barcode: 'BC-1' }));

		await expect(
			assignBarcode('target-id', { barcode: 'BC-1' }, Role.ADMIN),
		).rejects.toMatchObject({ code: 'BARCODE_IN_USE', statusCode: 409 });
	});
});

describe('resolveStudentByBarcode', () => {
	const stuUser = { id: 'u1', name: 'Nimal Perera', indexNumber: 42 };

	it('resolves via a single institute-scoped StudentBarcode match', async () => {
		studentBarcodeFindMany.mockResolvedValueOnce([{ instituteId: 'inst-1', user: stuUser }]);

		const result = await resolveStudentByBarcode('NUG-001');

		expect(result).toEqual({ user: stuUser, instituteId: 'inst-1', matchedBarcode: 'NUG-001' });
		expect(findUnique).not.toHaveBeenCalled();
	});

	it('falls through to the global User.barcode when no StudentBarcode matches', async () => {
		studentBarcodeFindMany.mockResolvedValueOnce([]);
		findUnique.mockResolvedValueOnce(stuUser);

		const result = await resolveStudentByBarcode('LMS-042');

		expect(result).toEqual({ user: stuUser, instituteId: null, matchedBarcode: 'LMS-042' });
	});

	it('falls through (does not guess an institute) when the code matches more than one institute', async () => {
		studentBarcodeFindMany.mockResolvedValueOnce([
			{ instituteId: 'inst-1', user: stuUser },
			{ instituteId: 'inst-2', user: { id: 'u2', name: 'Other', indexNumber: 7 } },
		]);
		findUnique.mockResolvedValueOnce(stuUser);

		const result = await resolveStudentByBarcode('AMBIGUOUS');

		expect(result).toEqual({ user: stuUser, instituteId: null, matchedBarcode: 'AMBIGUOUS' });
	});

	it('404s when the code matches nothing anywhere', async () => {
		studentBarcodeFindMany.mockResolvedValueOnce([]);
		findUnique.mockResolvedValueOnce(null);

		await expect(resolveStudentByBarcode('NOPE')).rejects.toMatchObject({
			code: 'BARCODE_NOT_FOUND',
			statusCode: 404,
		});
	});
});
