import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const { findUnique, update } = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
}));

vi.mock('@/config/database', () => ({
	prisma: {
		user: { findUnique, update },
	},
}));

import { updateStatus, assignBarcode } from './user.service';

const baseUser = (overrides: Partial<{ id: string; role: Role; barcode: string | null }> = {}) => ({
	id: 'target-id',
	role: Role.STUDENT,
	barcode: null,
	...overrides,
});

beforeEach(() => {
	findUnique.mockReset();
	update.mockReset();
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
