import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';

vi.mock('@/config/database', () => ({ prisma: {} }));
vi.mock('@/config/redis', () => ({ redis: {} }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/controllers/attendance.controller', () => ({
	getAttendanceByCourse: vi.fn(),
	getAttendanceBySession: vi.fn(),
	getStudentAttendance: vi.fn(),
	handleZoomWebhook: vi.fn(),
	markManualAttendance: vi.fn(),
	markVideoAttendance: vi.fn(),
	scanBarcode: vi.fn(),
}));
vi.mock('@/controllers/attendance-reconciliation.controller', () => ({
	previewZoomAttendance: vi.fn(),
	reconcileZoomAttendance: vi.fn(),
}));

import { attendanceRoutes } from './attendance.routes';

interface RouterLayer {
	route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> };
}
type Handle = (req: Request, res: Response, next: () => void) => void;

const roleGate = (role: Role): 'allowed' | { status: number; code?: string } => {
	const stack = (attendanceRoutes as unknown as { stack: RouterLayer[] }).stack;
	const layer = stack.find((l) => l.route?.path === '/student/:userId' && l.route.methods.get);
	const gate = layer!.route!.stack[1]!.handle as Handle;
	let refusal: { status: number; code?: string } | undefined;
	let passed = false;
	const res = {
		status: (s: number) => ({ json: (b: { code?: string }) => void (refusal = { status: s, code: b.code }) }),
	} as unknown as Response;
	gate({ user: { userId: 'u', role } } as Request, res, () => void (passed = true));
	return passed ? 'allowed' : refusal!;
};

describe('attendance history route: role gate', () => {
	it.each([Role.SUPER_ADMIN, Role.ADMIN, Role.TEACHER, Role.STUDENT])('lets %s through', (role) => {
		expect(roleGate(role)).toBe('allowed');
	});

	it('refuses a marker with 403 FORBIDDEN_ROLE', () => {
		expect(roleGate(Role.MARKER)).toEqual({ status: 403, code: 'FORBIDDEN_ROLE' });
	});
});
