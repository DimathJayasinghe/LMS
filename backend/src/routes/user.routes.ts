import { Router } from 'express';
import { Role } from '@prisma/client';
import * as UserController from '@/controllers/user.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import {
    assignBarcodeSchema,
    createStudentBarcodeSchema,
    listUsersQuerySchema,
    nicUploadUrlSchema,
    nicConfirmSchema,
    studentBarcodeIdParamSchema,
    updateRoleSchema,
    updateStatusSchema,
    userIdParamSchema,
} from '@/schemas/user.schema';

export const userRoutes = Router();

// GET /api/users — List users (Admin + Staff)
userRoutes.get(
    '/',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateQuery(listUsersQuerySchema),
    UserController.listUsers,
);

// GET /api/users/me — Current user profile
userRoutes.get('/me', verifyToken, UserController.getMe);

// ─── Account Setup (Student-only self-service) ─────────────

// POST /api/users/me/nic/upload-url — Presign a direct-to-R2 NIC photo upload
userRoutes.post(
    '/me/nic/upload-url',
    verifyToken,
    requireRole(Role.STUDENT),
    validateBody(nicUploadUrlSchema),
    UserController.getNicUploadUrl,
);

// POST /api/users/me/nic/confirm — Confirm the NIC photo actually reached R2
userRoutes.post(
    '/me/nic/confirm',
    verifyToken,
    requireRole(Role.STUDENT),
    validateBody(nicConfirmSchema),
    UserController.confirmNicUpload,
);

// GET /api/users/me/institute-barcodes — List my per-institute barcodes
userRoutes.get(
    '/me/institute-barcodes',
    verifyToken,
    requireRole(Role.STUDENT),
    UserController.listMyInstituteBarcodes,
);

// POST /api/users/me/institute-barcodes — Register a barcode for an institute
userRoutes.post(
    '/me/institute-barcodes',
    verifyToken,
    requireRole(Role.STUDENT),
    validateBody(createStudentBarcodeSchema),
    UserController.createMyInstituteBarcode,
);

// DELETE /api/users/me/institute-barcodes/:barcodeId — Remove one of my barcodes
userRoutes.delete(
    '/me/institute-barcodes/:barcodeId',
    verifyToken,
    requireRole(Role.STUDENT),
    validateParams(studentBarcodeIdParamSchema),
    UserController.deleteMyInstituteBarcode,
);

// GET /api/users/:id — Get user by id (Admin + Staff)
userRoutes.get(
    '/:id',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    UserController.getUserById,
);

// PATCH /api/users/:id/role — Update role (Admin only)
userRoutes.patch(
    '/:id/role',
    verifyToken,
    requireRole(Role.SUPER_ADMIN),
    validateParams(userIdParamSchema),
    validateBody(updateRoleSchema),
    UserController.updateRole,
);

// PATCH /api/users/:id/status — Activate/deactivate (Admin + Staff)
userRoutes.patch(
    '/:id/status',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    validateBody(updateStatusSchema),
    UserController.updateStatus,
);

// PATCH /api/users/:id/barcode — Assign barcode (Admin + Staff)
userRoutes.patch(
    '/:id/barcode',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    validateBody(assignBarcodeSchema),
    UserController.assignBarcode,
);
