import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { requireRole } from './role.middleware';

const run = (user: { role: Role } | undefined, allowed: Role[]) => {
	const json = vi.fn();
	const status = vi.fn().mockReturnValue({ json });
	const next = vi.fn();
	requireRole(...allowed)({ user } as unknown as Request, { status } as unknown as Response, next);
	return { json, status, next };
};

describe('requireRole', () => {
	it('lets an allowed role through', () => {
		const { next, status } = run({ role: Role.TEACHER }, [Role.TEACHER, Role.SUPER_ADMIN]);
		expect(next).toHaveBeenCalledTimes(1);
		expect(status).not.toHaveBeenCalled();
	});

	it('refuses another role with 403 and the FORBIDDEN_ROLE code', () => {
		const { next, status, json } = run({ role: Role.ADMIN }, [Role.TEACHER]);
		expect(next).not.toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(403);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'error', code: 'FORBIDDEN_ROLE' }),
		);
	});

	it('answers 401 when there is no authenticated user', () => {
		const { status, next } = run(undefined, [Role.TEACHER]);
		expect(status).toHaveBeenCalledWith(401);
		expect(next).not.toHaveBeenCalled();
	});
});
