import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { Role } from '@prisma/client';

vi.mock('@/config/database', () => ({ prisma: {} }));
vi.mock('@/config/redis', () => ({ redis: {} }));
vi.mock('@/config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/controllers/user.controller', () => ({
  listUsers: vi.fn(),
  listAcademicStaff: vi.fn(),
  getMe: vi.fn(),
  getNicUploadUrl: vi.fn(),
  confirmNicUpload: vi.fn(),
  listMyInstituteBarcodes: vi.fn(),
  createMyInstituteBarcode: vi.fn(),
  deleteMyInstituteBarcode: vi.fn(),
  resolveBarcode: vi.fn(),
  lookupStudents: vi.fn(),
  getUserById: vi.fn(),
  updateRole: vi.fn(),
  updateStatus: vi.fn(),
  assignBarcode: vi.fn(),
  resetPassword: vi.fn(),
  createStaff: vi.fn(),
  getOrphanedClasses: vi.fn(),
  handOverOrphaned: vi.fn(),
}));
vi.mock('@/controllers/profile.controller', () => ({
  updateProfile: vi.fn(),
  getAvatarUploadUrl: vi.fn(),
  confirmAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  changeEmail: vi.fn(),
  changePassword: vi.fn(),
}));

import { userRoutes } from './user.routes';
import { checkIdempotency, checkOneTimeSecretIdempotency } from '@/middleware/idempotency.middleware';
import * as UserController from '@/controllers/user.controller';

interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

function handlesFor(router: unknown, method: string, path: string): unknown[] {
  const stack = (router as { stack: RouterLayer[] }).stack;
  const layer = stack.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods[method],
  );
  if (!layer) throw new Error(`route ${method.toUpperCase()} ${path} not found`);
  return layer.route!.stack.map((entry) => entry.handle);
}

describe('user routes — idempotency wiring', () => {
  it('PATCH /:id/role carries checkIdempotency', () => {
    expect(handlesFor(userRoutes, 'patch', '/:id/role')).toContain(checkIdempotency);
  });

  it('PATCH /:id/role runs checkIdempotency immediately before the controller', () => {
    const stack = handlesFor(userRoutes, 'patch', '/:id/role');
    const idempotencyIndex = stack.indexOf(checkIdempotency);
    const controllerIndex = stack.indexOf(UserController.updateRole);
    expect(idempotencyIndex).toBeGreaterThanOrEqual(0);
    expect(controllerIndex).toBeGreaterThanOrEqual(0);
    expect(idempotencyIndex).toBe(controllerIndex - 1);
  });

  it('PATCH /:id/status carries checkIdempotency', () => {
    expect(handlesFor(userRoutes, 'patch', '/:id/status')).toContain(checkIdempotency);
  });

  it('PATCH /:id/status runs checkIdempotency immediately before the controller', () => {
    const stack = handlesFor(userRoutes, 'patch', '/:id/status');
    const idempotencyIndex = stack.indexOf(checkIdempotency);
    const controllerIndex = stack.indexOf(UserController.updateStatus);
    expect(idempotencyIndex).toBeGreaterThanOrEqual(0);
    expect(controllerIndex).toBeGreaterThanOrEqual(0);
    expect(idempotencyIndex).toBe(controllerIndex - 1);
  });

  it('PATCH /:id/barcode carries checkIdempotency', () => {
    expect(handlesFor(userRoutes, 'patch', '/:id/barcode')).toContain(checkIdempotency);
  });

  it('PATCH /:id/barcode runs checkIdempotency immediately before the controller', () => {
    const stack = handlesFor(userRoutes, 'patch', '/:id/barcode');
    const idempotencyIndex = stack.indexOf(checkIdempotency);
    const controllerIndex = stack.indexOf(UserController.assignBarcode);
    expect(idempotencyIndex).toBeGreaterThanOrEqual(0);
    expect(controllerIndex).toBeGreaterThanOrEqual(0);
    expect(idempotencyIndex).toBe(controllerIndex - 1);
  });
});

const roleGate = (role: Role): string => {
  const gate = handlesFor(userRoutes, 'patch', '/:id/role')[1] as (req: Request, res: Response, next: () => void) => void;
  let result = '';
  const res = { status: () => ({ json: (body: { code: string }) => { result = body.code; } }) } as unknown as Response;
  gate({ user: { userId: 'actor', role } } as Request, res, () => { result = 'allowed'; });
  return result;
};

describe('role change route', () => {
  it('allows the owner', () => expect(roleGate(Role.SUPER_ADMIN)).toBe('allowed'));
  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s', role => expect(roleGate(role)).toBe('FORBIDDEN_ROLE'));
});

describe('user routes — staff-assisted password reset', () => {
  const stack = () => handlesFor(userRoutes, 'post', '/:id/reset-password') as Array<(req: Request, res: Response, next: () => void) => void>;
  const roleGuard = () => stack()[1]!;
  const call = (role: Role) => {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
    const next = vi.fn();
    roleGuard()({ user: { userId: 'u', role } } as Request, res, next);
    return { next, status: res.status as ReturnType<typeof vi.fn> };
  };

  it.each([Role.SUPER_ADMIN, Role.ADMIN])('lets %s through the role guard', (role) => {
    expect(call(role).next).toHaveBeenCalled();
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s with 403 at the route', (role) => {
    const { next, status } = call(role);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses the one-time-secret idempotency variant immediately before the controller', () => {
    const handles = stack() as unknown[];
    expect(handles).not.toContain(checkIdempotency);
    expect(handles.indexOf(checkOneTimeSecretIdempotency)).toBe(handles.indexOf(UserController.resetPassword) - 1);
  });
});

describe('user routes — staff account creation', () => {
  const stack = () => handlesFor(userRoutes, 'post', '/staff') as Array<(req: Request, res: Response, next: () => void) => void>;
  const call = (role: Role) => {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
    const next = vi.fn();
    stack()[1]!({ user: { userId: 'u', role } } as Request, res, next);
    return { next, status: res.status as ReturnType<typeof vi.fn> };
  };

  it('lets only the owner through the role guard', () => {
    expect(call(Role.SUPER_ADMIN).next).toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s with 403 at the route', (role) => {
    const { next, status } = call(role);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses the one-time-secret idempotency variant immediately before the controller', () => {
    const handles = stack() as unknown[];
    expect(handles).not.toContain(checkIdempotency);
    expect(handles.indexOf(checkOneTimeSecretIdempotency)).toBe(handles.indexOf(UserController.createStaff) - 1);
  });
});

describe('user routes — student lookup wiring', () => {
  const index = (method: string, path: string) =>
    (userRoutes as unknown as { stack: RouterLayer[] }).stack.findIndex((l) => l.route?.path === path && l.route.methods[method]);

  it('registers /lookup before /:id so it is not read as an id', () => {
    expect(index('get', '/lookup')).toBeGreaterThanOrEqual(0);
    expect(index('get', '/lookup')).toBeLessThan(index('get', '/:id'));
  });

  it('wires /lookup to its controller', () => {
    expect(handlesFor(userRoutes, 'get', '/lookup')).toContain(UserController.lookupStudents);
  });
});

describe('user routes — class hand-over', () => {
  const index = (method: string, path: string) =>
    (userRoutes as unknown as { stack: RouterLayer[] }).stack.findIndex((l) => l.route?.path === path && l.route.methods[method]);
  const gate = (method: string, path: string, role: Role) => {
    const next = vi.fn();
    const status = vi.fn().mockReturnValue({ json: vi.fn() });
    (handlesFor(userRoutes, method, path)[1] as (req: Request, res: Response, next: () => void) => void)({ user: { userId: 'u', role } } as Request, { status } as unknown as Response, next);
    return { next, status };
  };

  it('registers /orphaned-classes before /:id so it is not read as an id', () => {
    expect(index('get', '/orphaned-classes')).toBeGreaterThanOrEqual(0);
    expect(index('get', '/orphaned-classes')).toBeLessThan(index('get', '/:id'));
  });

  it.each([['get', '/orphaned-classes'], ['post', '/:id/handover']])('lets only the owner through %s %s', (method, path) => {
    expect(gate(method, path, Role.SUPER_ADMIN).next).toHaveBeenCalled();
    for (const role of [Role.ADMIN, Role.TEACHER, Role.MARKER, Role.STUDENT]) {
      const { next, status } = gate(method, path, role);
      expect(status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('wires the hand-over to its controller, behind idempotency', () => {
    const handles = handlesFor(userRoutes, 'post', '/:id/handover');
    expect(handles.indexOf(checkIdempotency)).toBe(handles.indexOf(UserController.handOverOrphaned) - 1);
  });
});
