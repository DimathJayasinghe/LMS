import { describe, it, expect, vi } from 'vitest';

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
  getUserById: vi.fn(),
  updateRole: vi.fn(),
  updateStatus: vi.fn(),
  assignBarcode: vi.fn(),
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
import { checkIdempotency } from '@/middleware/idempotency.middleware';
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
