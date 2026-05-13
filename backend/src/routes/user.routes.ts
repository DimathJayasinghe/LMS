import { Router } from 'express';
import { Role } from '@prisma/client';
import * as UserController from '@/controllers/user.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
    assignBarcodeSchema,
    listUsersQuerySchema,
    updateRoleSchema,
    updateStatusSchema,
    userIdParamSchema,
} from '@/schemas/user.schema';

export const userRoutes = Router();

// GET /api/users — List users (Admin + Staff)
userRoutes.get(
    '/',
    verifyToken,
    requireRole(Role.ADMIN, Role.STAFF),
    validateQuery(listUsersQuerySchema),
    UserController.listUsers,
);

// GET /api/users/me — Current user profile
userRoutes.get('/me', verifyToken, UserController.getMe);

// GET /api/users/:id — Get user by id (Admin + Staff)
userRoutes.get(
    '/:id',
    verifyToken,
    requireRole(Role.ADMIN, Role.STAFF),
    validateParams(userIdParamSchema),
    UserController.getUserById,
);

// PATCH /api/users/:id/role — Update role (Admin only)
userRoutes.patch(
    '/:id/role',
    verifyToken,
    requireRole(Role.ADMIN),
    validateParams(userIdParamSchema),
    validateBody(updateRoleSchema),
    UserController.updateRole,
);

// PATCH /api/users/:id/status — Activate/deactivate (Admin + Staff)
userRoutes.patch(
    '/:id/status',
    verifyToken,
    requireRole(Role.ADMIN, Role.STAFF),
    validateParams(userIdParamSchema),
    validateBody(updateStatusSchema),
    UserController.updateStatus,
);

// PATCH /api/users/:id/barcode — Assign barcode (Admin + Staff)
userRoutes.patch(
    '/:id/barcode',
    verifyToken,
    requireRole(Role.ADMIN, Role.STAFF),
    validateParams(userIdParamSchema),
    validateBody(assignBarcodeSchema),
    UserController.assignBarcode,
);
