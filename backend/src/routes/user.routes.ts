import { Router } from 'express';
import { Role } from '@prisma/client';
import * as UserController from '@/controllers/user.controller';
import * as ProfileController from '@/controllers/profile.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { checkIdempotency, checkOneTimeSecretIdempotency } from '@/middleware/idempotency.middleware';
import {
    assignBarcodeSchema,
    academicStaffQuerySchema,
    createStaffSchema,
    createStudentBarcodeSchema,
    handoverOrphanedSchema,
    listUsersQuerySchema,
    nicUploadUrlSchema,
    nicConfirmSchema,
    resetPasswordSchema,
    resolveBarcodeQuerySchema,
    studentBarcodeIdParamSchema,
    studentLookupQuerySchema,
    updateRoleSchema,
    updateStatusSchema,
    userIdParamSchema,
} from '@/schemas/user.schema';
import { createStudentSchema } from '@/schemas/student-registration.schema';
import {
    updateProfileSchema,
    avatarUploadUrlSchema,
    avatarConfirmSchema,
    changeEmailSchema,
    changePasswordSchema,
} from '@/schemas/profile.schema';

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

// ─── Profile self-service (any authenticated role) ─────────

// PATCH /api/users/me/profile — Update own contact details
userRoutes.patch(
    '/me/profile',
    verifyToken,
    validateBody(updateProfileSchema),
    ProfileController.updateProfile,
);

// POST /api/users/me/avatar/upload-url — Presign a direct-to-public-R2 avatar upload
userRoutes.post(
    '/me/avatar/upload-url',
    verifyToken,
    validateBody(avatarUploadUrlSchema),
    ProfileController.getAvatarUploadUrl,
);

// POST /api/users/me/avatar/confirm — Confirm the avatar reached R2, persist the URL
userRoutes.post(
    '/me/avatar/confirm',
    verifyToken,
    validateBody(avatarConfirmSchema),
    ProfileController.confirmAvatar,
);

// DELETE /api/users/me/avatar — Remove own avatar
userRoutes.delete('/me/avatar', verifyToken, ProfileController.removeAvatar);

// PATCH /api/users/me/email — Change own email (current password + weekly cooldown)
userRoutes.patch(
    '/me/email',
    verifyToken,
    validateBody(changeEmailSchema),
    ProfileController.changeEmail,
);

// PATCH /api/users/me/password — Change own password (current password + weekly cooldown)
userRoutes.patch(
    '/me/password',
    verifyToken,
    validateBody(changePasswordSchema),
    ProfileController.changePassword,
);

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

// GET /api/users/lookup — Slim student search for the desk: id, name, index number, photo (Admin + Super Admin)
// Registered before '/:id' so "lookup" isn't read as an id.
userRoutes.get(
    '/lookup',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateQuery(studentLookupQuerySchema),
    UserController.lookupStudents,
);

// GET /api/users/resolve-barcode — Resolve a scanned barcode to a student (Admin + Staff)
userRoutes.get(
    '/resolve-barcode',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateQuery(resolveBarcodeQuerySchema),
    UserController.resolveBarcode,
);

// Minimal academic directory: SUPER_ADMIN selects teachers/markers; TEACHER
// may list markers for exams. No email, phone, NIC, or account metadata leaks.
userRoutes.get(
    '/academic-staff',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.TEACHER),
    validateQuery(academicStaffQuerySchema),
    UserController.listAcademicStaff,
);

// GET /api/users/orphaned-classes — Active classes whose teacher left, grouped by teacher (Super Admin)
// Registered before '/:id' so "orphaned-classes" isn't read as an id.
userRoutes.get(
    '/orphaned-classes',
    verifyToken,
    requireRole(Role.SUPER_ADMIN),
    UserController.getOrphanedClasses,
);

// GET /api/users/:id — Get user by id (Admin + Staff)
userRoutes.get(
    '/:id',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    UserController.getUserById,
);

// PATCH /api/users/:id/role — Change a staff member's role, with a reason, the owner's password and a hand-over (Super Admin)
userRoutes.patch(
    '/:id/role',
    verifyToken,
    requireRole(Role.SUPER_ADMIN),
    validateParams(userIdParamSchema),
    validateBody(updateRoleSchema),
    checkIdempotency,
    UserController.updateRole,
);

// PATCH /api/users/:id/status — Activate/deactivate: the front desk for students only, the owner for any account (Admin + Super Admin)
userRoutes.patch(
    '/:id/status',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    validateBody(updateStatusSchema),
    checkIdempotency,
    UserController.updateStatus,
);

// POST /api/users/:id/handover — Hand the classes of an account that already left to working teachers (Super Admin)
userRoutes.post(
    '/:id/handover',
    verifyToken,
    requireRole(Role.SUPER_ADMIN),
    validateParams(userIdParamSchema),
    validateBody(handoverOrphanedSchema),
    checkIdempotency,
    UserController.handOverOrphaned,
);

// PATCH /api/users/:id/barcode — Assign barcode (Admin + Staff)
userRoutes.patch(
    '/:id/barcode',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    validateBody(assignBarcodeSchema),
    checkIdempotency,
    UserController.assignBarcode,
);

// POST /api/users/staff — Create a teacher, front-desk or marker account with a one-time password (Super Admin)
userRoutes.post(
    '/staff',
    verifyToken,
    requireRole(Role.SUPER_ADMIN),
    validateBody(createStaffSchema),
    checkOneTimeSecretIdempotency,
    UserController.createStaff,
);

// POST /api/users/students — Register a walk-in student with a card and a one-time password (Admin + Super Admin)
userRoutes.post(
    '/students',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateBody(createStudentSchema),
    checkOneTimeSecretIdempotency,
    UserController.createStudent,
);

// POST /api/users/:id/reset-password — Staff-assisted reset: one-time temporary password, shown once (Admin + Super Admin)
userRoutes.post(
    '/:id/reset-password',
    verifyToken,
    requireRole(Role.SUPER_ADMIN, Role.ADMIN),
    validateParams(userIdParamSchema),
    validateBody(resetPasswordSchema),
    checkOneTimeSecretIdempotency,
    UserController.resetPassword,
);
