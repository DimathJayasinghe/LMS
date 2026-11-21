import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';

vi.mock('@/config/database', () => ({ prisma: {} }));
vi.mock('@/config/redis', () => ({ redis: {} }));
vi.mock('@/config/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/controllers/video.controller', () => ({
	initiateUpload: vi.fn(),
	createVideo: vi.fn(),
	updateVideo: vi.fn(),
	deleteVideo: vi.fn(),
	listVideosForClass: vi.fn(),
	getStreamUrl: vi.fn(),
	getVideo: vi.fn(),
	bunnyWebhook: vi.fn(),
}));

import { videoRoutes } from './video.routes';

interface RouterLayer {
	route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> };
}

type Handle = (req: Request, res: Response, next: () => void) => void;

const handlesFor = (method: string, path: string): Handle[] => {
	const stack = (videoRoutes as unknown as { stack: RouterLayer[] }).stack;
	const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
	if (!layer) throw new Error(`route ${method.toUpperCase()} ${path} not found`);
	return layer.route!.stack.map((e) => e.handle as Handle);
};

/** Runs the route's role gate (the second handler, after verifyToken) for an actor with this role. */
const roleGate = (path: string, role: Role): 'allowed' | number => {
	const gate = handlesFor('get', path)[1]!;
	let status: number | undefined;
	let passed = false;
	const res = { status: (s: number) => ({ json: () => void (status = s) }) } as unknown as Response;
	gate({ user: { userId: 'u', role } } as Request, res, () => void (passed = true));
	return passed ? 'allowed' : status!;
};

describe('video read routes: role gate at the route layer', () => {
	const readRoutes = ['/class/:classId', '/:id', '/:id/stream'];

	for (const path of readRoutes) {
		it.each([Role.STUDENT, Role.TEACHER, Role.SUPER_ADMIN])(`GET ${path} lets %s through`, (role) => {
			expect(roleGate(path, role)).toBe('allowed');
		});
		it.each([Role.ADMIN, Role.MARKER])(`GET ${path} refuses %s with 403`, (role) => {
			expect(roleGate(path, role)).toBe(403);
		});
	}
});
