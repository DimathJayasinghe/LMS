import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import * as PaymentController from '@/controllers/payment.controller';
import * as OutstandingController from '@/controllers/outstanding.controller';
import * as CashController from '@/controllers/cash.controller';
import * as PaymentBulkController from '@/controllers/payment-bulk.controller';
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
	refundPaymentSchema,
	paymentIdParamSchema,
	paymentsSummaryQuerySchema,
	financialReportQuerySchema,
	bulkUploadQuerySchema,
} from '@/schemas/payment.schema';
import { cashQuerySchema, cashTallyIdParamSchema, cashTallyQuerySchema, closeCashDaySchema } from '@/schemas/cash.schema';
import { outstandingExportQuerySchema, outstandingQuerySchema, sendFeeRemindersSchema } from '@/schemas/outstanding.schema';
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

// ─── Financial Reports (Super Admin / scoped Teacher) ─────
// Registered BEFORE '/:id' so "reports" isn't captured as an id param.
paymentRoutes.get(
	'/reports',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.TEACHER),
	validateQuery(financialReportQuerySchema),
	PaymentController.getFinancialReport,
);

// ─── Who owes (Admin/Super Admin; export Super Admin only) ─
// Registered BEFORE '/:id' so "outstanding" isn't captured as an id param.
paymentRoutes.get(
	'/outstanding',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateQuery(outstandingQuerySchema),
	OutstandingController.listOutstanding,
);

paymentRoutes.get(
	'/outstanding/export',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateQuery(outstandingExportQuerySchema),
	OutstandingController.exportOutstanding,
);

paymentRoutes.post(
	'/outstanding/reminders',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateBody(sendFeeRemindersSchema),
	checkIdempotency,
	OutstandingController.sendFeeReminders,
);

// ─── End-of-day cash (Admin sees and counts their own; Super Admin sees all and reconciles) ─
// Registered BEFORE '/:id' so "cash" and "cash-tally" aren't captured as an id param.
paymentRoutes.get(
	'/cash',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateQuery(cashQuerySchema),
	CashController.listCash,
);

paymentRoutes.get(
	'/cash-tally',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateQuery(cashTallyQuerySchema),
	CashController.listCashTallies,
);

// Naturally idempotent: one row per collector, day and branch, so a repeat updates instead of adding.
paymentRoutes.post(
	'/cash-tally',
	verifyToken,
	requireRole(Role.SUPER_ADMIN, Role.ADMIN),
	validateBody(closeCashDaySchema),
	CashController.closeCashDay,
);

paymentRoutes.patch(
	'/cash-tally/:id/reconcile',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateParams(cashTallyIdParamSchema),
	CashController.reconcileCashTally,
);

// ─── Get Payment by Id (Owner/Admin/Staff) ────────────────
paymentRoutes.get(
	'/:id/adjustments',
	verifyToken,
	requireRole(Role.STUDENT, Role.SUPER_ADMIN, Role.ADMIN),
	validateParams(paymentIdParamSchema),
	PaymentController.listPaymentAdjustments,
);

paymentRoutes.post(
	'/:id/refunds',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateParams(paymentIdParamSchema),
	validateBody(refundPaymentSchema),
	checkIdempotency,
	PaymentController.refundPayment,
);

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

// ─── Bulk Upload (owner only: migration and recovery tool) ─
// The query is checked first so a bad `dryRun` is refused before an idempotency key is spent.
paymentRoutes.post(
	'/bulk-upload',
	verifyToken,
	requireRole(Role.SUPER_ADMIN),
	validateQuery(bulkUploadQuerySchema),
	checkIdempotency,
	upload.single('file'),
	PaymentBulkController.bulkUploadPayments,
);
