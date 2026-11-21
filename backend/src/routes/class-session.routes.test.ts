import { Role } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { expect, it, vi } from 'vitest';

vi.mock('@/controllers/class-session.controller', () => ({ createClassSession: vi.fn(), listClassSessions: vi.fn(), getClassSessionById: vi.fn(), updateClassSession: vi.fn(), deleteClassSession: vi.fn() }));
vi.mock('@/controllers/live-class.controller', () => ({ scheduleLiveClass: vi.fn(), issueLiveClassToken: vi.fn() }));
vi.mock('@/middleware/auth.middleware', () => ({ verifyToken: vi.fn() }));
vi.mock('@/middleware/idempotency.middleware', () => ({ checkIdempotency: vi.fn() }));
import { classSessionRoutes } from './class-session.routes';

it('denies front desk access to live scheduling at the route', () => {
  const stack = (classSessionRoutes as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => void }> } }> }).stack;
  const route = stack.find((layer) => layer.route?.path === '/:sessionId/live/schedule')!.route!;
  const guard = route.stack[1]!.handle;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const next = vi.fn();
  guard({ user: { userId: 'admin', role: Role.ADMIN } } as Request, { status } as unknown as Response, next);
  expect(status).toHaveBeenCalledWith(403);
  expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN_ROLE' }));
  expect(next).not.toHaveBeenCalled();
});
