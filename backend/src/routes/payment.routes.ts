import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import * as PaymentController from '@/controllers/payment.controller';
import { verifyToken } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';
import { validateBody, validateParams, validateQuery } from '@/middleware/validate.middleware';
import { checkIdempotency } from '@/middleware/idempotency.middleware';
import {
	collectEntrancePaymentSchema,
	initiatePaymentSchema,
	listMyPaymentsQuerySchema,
	listPaymentsQuerySchema,
	overridePaymentSchema,
	paymentIdParamSchema,
	paymentsSummaryQuerySchema,
	financialReportQuerySchema,
} from '@/schemas/payment.schema';
import { PAYMENTS_BULK_UPLOAD_MAX_BYTES } from '@/utils/constants';

export const paymentRoutes = Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: PAYMENTS_BULK_UPLOAD_MAX_BYTES },
});

// ─── PayHere Checkout (Student) ───────────────────────────
paymentRoutes.post(
	'/initiate',
	verifyToken,
	requireRole(Role.STUDENT),
	validateBody(initiatePaymentSchema),
	checkIdempotency,
	PaymentController.initiatePayherePayment,
);

paymentRoutes.post(
	'/payhere/checkout',
	verifyToken,
	requireRole(Role.STUDENT),
	validateBody(initiatePaymentSchema),
	checkIdempotency,
	PaymentController.initiatePayherePayment,
);

// ─── Entrance Collection (Admin/Staff) ─────────────────────
paymentRoutes.post(
	'/collect-entrance',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateBody(collectEntrancePaymentSchema),
	checkIdempotency,
	PaymentController.collectEntrancePayment,
);

// ─── PayHere Notify (Webhook) ─────────────────────────────
paymentRoutes.post('/payhere/notify', PaymentController.handlePayhereNotify);

// ─── PayHere Status (Student/Admin) ───────────────────────
paymentRoutes.get(
	'/payhere/status/:id',
	verifyToken,
	requireRole(Role.STUDENT, Role.SUPER_ADMIN, Role.ADMIN),
	validateParams(paymentIdParamSchema),
	PaymentController.getPayhereStatus,
);

// ─── List Payments (Admin/Staff) ──────────────────────────
paymentRoutes.get(
	'/',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateQuery(listPaymentsQuerySchema),
	PaymentController.listPayments,
);

// ─── List My Payments (Student) ───────────────────────────
paymentRoutes.get(
	'/my',
	verifyToken,
	requireRole(Role.STUDENT),
	validateQuery(listMyPaymentsQuerySchema),
	PaymentController.listMyPayments,
);

// ─── Month Summary (Admin/Staff) ──────────────────────────
// Registered BEFORE '/:id' so "summary" isn't captured as an id param.
paymentRoutes.get(
	'/summary',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateQuery(paymentsSummaryQuerySchema),
	PaymentController.getPaymentsSummary,
);

// ─── Financial Reports (Super Admin) ──────────────────────
// Registered BEFORE '/:id' so "reports" isn't captured as an id param.
paymentRoutes.get(
	'/reports',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateQuery(financialReportQuerySchema),
	PaymentController.getFinancialReport,
);

// ─── Get Payment by Id (Owner/Admin/Staff) ────────────────
paymentRoutes.get(
	'/:id',
	verifyToken,
	requireRole(Role.STUDENT, Role.SUPER_ADMIN, Role.ADMIN),
	validateParams(paymentIdParamSchema),
	PaymentController.getPaymentById,
);

// ─── Override Payment (Admin) ─────────────────────────────
paymentRoutes.patch(
	'/:id/override',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateParams(paymentIdParamSchema),
	validateBody(overridePaymentSchema),
	checkIdempotency,
	PaymentController.overridePayment,
);

// ─── Bulk Upload (Admin/Staff) ────────────────────────────
paymentRoutes.post(
	'/bulk-upload',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	checkIdempotency,
	upload.single('file'),
	PaymentController.bulkUploadPayments,
);
