import { ClassType, NotificationType, PaymentAdjustmentType, PaymentMethod, PaymentStatus, Prisma, Role } from '@prisma/client';
import { readSheet, type SheetData } from 'read-excel-file/node';
import { prisma } from '@/config/database';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { AppError } from '@/utils/app-error';
import * as NotificationService from '@/services/notification.service';
import {
	PAYHERE_CHECKOUT_PATH,
	PAYHERE_COUNTRY,
	PAYHERE_CURRENCY,
	PAYHERE_STATUS_CANCELED,
	PAYHERE_STATUS_CHARGEDBACK,
	PAYHERE_STATUS_FAILED,
	PAYHERE_STATUS_PENDING,
	PAYHERE_STATUS_SUCCESS,
} from '@/utils/constants';
import {
	formatPayhereAmount,
	generatePayhereHash,
	generatePayhereSignature,
	isPayhereSignatureValid,
} from '@/utils/payhere';
import { getCurrentPaymentMonth } from '@/services/access.service';
import {
	bulkPaymentRowSchema,
	type BulkPaymentRow,
	type CollectEntrancePaymentInput,
	type InitiatePaymentInput,
	type ListMyPaymentsQuery,
	type ListPaymentsQuery,
	type OverridePaymentInput,
	type PayhereNotifyInput,
} from '@/schemas/payment.schema';

interface PayhereCheckoutPayload {
	merchant_id: string;
	return_url: string;
	cancel_url: string;
	notify_url: string;
	first_name: string;
	last_name: string;
	email: string;
	phone: string;
	address: string;
	city: string;
	country: string;
	order_id: string;
	items: string;
	currency: string;
	amount: string;
	hash: string;
	custom_1?: string;
	custom_2?: string;
}

interface PayhereConfig {
	merchantId: string;
	merchantSecret: string;
	baseUrl: string;
	returnUrl: string;
	cancelUrl: string;
	notifyUrl: string;
}

interface PaginatedResult<T> {
	data: T[];
	count: number;
}

interface PaymentSummary {
	id: string;
	amount: Prisma.Decimal;
	refundedAmount: Prisma.Decimal;
	status: PaymentStatus;
	method: PaymentMethod;
	payhereId: string | null;
	paymentMonth: string;
	note: string | null;
	createdAt: Date;
	updatedAt: Date;
	collectedBy: { id: string; name: string } | null;
	collectedAtInstitute: { id: string; name: string; code: string } | null;
	collectedViaBarcode: string | null;
	enrollment: {
		id: string;
		classType: ClassType;
		userId: string;
		user: {
			id: string;
			name: string;
			email: string;
			indexNumber: number;
			phone: string | null;
			address: string | null;
			city: string | null;
		};
		course: {
			id: string;
			name: string;
			year: number;
			monthlyFee: Prisma.Decimal;
		};
	};
}

interface PayhereCheckoutResult {
	checkoutUrl: string;
	payload: PayhereCheckoutPayload;
	payment: PaymentSummary;
}

interface BulkUploadResult {
	total: number;
	created: number;
	updated: number;
	skipped: number;
	errors: Array<{ row: number; message: string }>;
}

const paymentSelect = {
	id: true,
	amount: true,
	refundedAmount: true,
	status: true,
	method: true,
	payhereId: true,
	paymentMonth: true,
	note: true,
	createdAt: true,
	updatedAt: true,
	collectedBy: {
		select: { id: true, name: true },
	},
	collectedAtInstitute: {
		select: { id: true, name: true, code: true },
	},
	collectedViaBarcode: true,
	enrollment: {
		select: {
			id: true,
			classType: true,
			userId: true,
			user: {
				select: {
					id: true,
					name: true,
					email: true,
					indexNumber: true,
					phone: true,
					address: true,
					city: true,
				},
			},
			course: {
				select: {
					id: true,
					name: true,
					year: true,
					monthlyFee: true,
				},
			},
		},
	},
} satisfies Prisma.PaymentSelect;

const getPayhereConfig = (): PayhereConfig => {
	const { PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET, PAYHERE_BASE_URL } = env;
	const { PAYHERE_RETURN_URL, PAYHERE_CANCEL_URL, PAYHERE_NOTIFY_URL } = env;

	if (!PAYHERE_MERCHANT_ID || !PAYHERE_MERCHANT_SECRET || !PAYHERE_BASE_URL) {
		throw new AppError('PAYHERE_NOT_CONFIGURED', 500, 'PayHere is not configured.');
	}

	if (!PAYHERE_RETURN_URL || !PAYHERE_CANCEL_URL || !PAYHERE_NOTIFY_URL) {
		throw new AppError('PAYHERE_URLS_MISSING', 500, 'PayHere callback URLs are missing.');
	}

	return {
		merchantId: PAYHERE_MERCHANT_ID,
		merchantSecret: PAYHERE_MERCHANT_SECRET,
		baseUrl: PAYHERE_BASE_URL.replace(/\/$/, ''),
		returnUrl: PAYHERE_RETURN_URL,
		cancelUrl: PAYHERE_CANCEL_URL,
		notifyUrl: PAYHERE_NOTIFY_URL,
	};
};

const splitName = (fullName: string): { firstName: string; lastName: string } => {
	const parts = fullName.trim().split(/\s+/).filter(Boolean);
	if (parts.length <= 1) {
		return { firstName: parts[0] ?? 'Student', lastName: 'Student' };
	}
	return {
		firstName: parts[0]!,
		lastName: parts.slice(1).join(' '),
	};
};

const resolvePayhereCheckoutUrl = (baseUrl: string): string => {
	if (baseUrl.endsWith(PAYHERE_CHECKOUT_PATH)) {
		return baseUrl;
	}
	return `${baseUrl}${PAYHERE_CHECKOUT_PATH}`;
};

const resolvePayhereStatus = (statusCode: number): PaymentStatus => {
	if (statusCode === PAYHERE_STATUS_SUCCESS) {
		return PaymentStatus.SUCCESS;
	}

	if (statusCode === PAYHERE_STATUS_PENDING) {
		return PaymentStatus.PENDING;
	}

	if (
		statusCode === PAYHERE_STATUS_CANCELED ||
		statusCode === PAYHERE_STATUS_FAILED ||
		statusCode === PAYHERE_STATUS_CHARGEDBACK
	) {
		return PaymentStatus.FAILED;
	}

	return PaymentStatus.FAILED;
};

const getEnrollmentForStudent = async (
	enrollmentId: string,
	userId: string,
): Promise<Prisma.EnrollmentGetPayload<{ include: { course: true; user: true } }>> => {
	const enrollment = await prisma.enrollment.findFirst({
		where: { id: enrollmentId, userId },
		include: { course: true, user: true },
	});

	if (!enrollment) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
	}

	return enrollment;
};

const ensurePayhereReady = (user: { phone: string | null; name: string }): void => {
	if (!user.phone) {
		throw new AppError('PHONE_REQUIRED', 400, 'Phone number is required for payments.');
	}

	if (!user.name?.trim()) {
		throw new AppError('NAME_REQUIRED', 400, 'Name is required for payments.');
	}
};

export const initiatePayherePayment = async (
	userId: string,
	input: InitiatePaymentInput,
): Promise<PayhereCheckoutResult> => {
	const config = getPayhereConfig();
	const enrollment = await getEnrollmentForStudent(input.enrollmentId, userId);

	ensurePayhereReady(enrollment.user);

	const existing = await prisma.payment.findUnique({
		where: {
			enrollmentId_paymentMonth: {
				enrollmentId: enrollment.id,
				paymentMonth: input.paymentMonth,
			},
		},
		select: { id: true, status: true },
	});

	if (existing?.status === PaymentStatus.SUCCESS) {
		throw new AppError('PAYMENT_ALREADY_PAID', 409, 'Payment already completed.');
	}
	if (existing?.status === PaymentStatus.REFUNDED) {
		throw new AppError('PAYMENT_REFUNDED_IMMUTABLE', 409, 'This payment was fully refunded and cannot be reused. Contact support.');
	}

	const payment = await prisma.payment.upsert({
		where: {
			enrollmentId_paymentMonth: {
				enrollmentId: enrollment.id,
				paymentMonth: input.paymentMonth,
			},
		},
		create: {
			enrollmentId: enrollment.id,
			paymentMonth: input.paymentMonth,
			amount: enrollment.course.monthlyFee,
			status: PaymentStatus.PENDING,
		},
		update: {
			amount: enrollment.course.monthlyFee,
			status: PaymentStatus.PENDING,
		},
		select: paymentSelect,
	});

	const { firstName, lastName } = splitName(enrollment.user.name);
	const amount = formatPayhereAmount(payment.amount);
	const hash = generatePayhereHash({
		merchantId: config.merchantId,
		orderId: payment.id,
		amount,
		currency: PAYHERE_CURRENCY,
		merchantSecret: config.merchantSecret,
	});

	const payload: PayhereCheckoutPayload = {
		merchant_id: config.merchantId,
		return_url: config.returnUrl,
		cancel_url: config.cancelUrl,
		notify_url: config.notifyUrl,
		first_name: firstName,
		last_name: lastName,
		email: enrollment.user.email,
		phone: enrollment.user.phone ?? '',
		address: enrollment.user.address ?? 'N/A',
		city: enrollment.user.city ?? 'N/A',
		country: PAYHERE_COUNTRY,
		order_id: payment.id,
		items: `${enrollment.course.name} ${enrollment.course.year} - ${input.paymentMonth}`,
		currency: PAYHERE_CURRENCY,
		amount,
		hash,
		custom_1: enrollment.id,
		custom_2: userId,
	};

	return {
		checkoutUrl: resolvePayhereCheckoutUrl(config.baseUrl),
		payload,
		payment,
	};
};

export const handlePayhereNotify = async (
	input: PayhereNotifyInput,
): Promise<PaymentSummary> => {
	const config = getPayhereConfig();

	if (input.merchant_id !== config.merchantId) {
		throw new AppError('PAYHERE_MERCHANT_MISMATCH', 400, 'Invalid merchant id.');
	}

	const expectedSignature = generatePayhereSignature({
		merchantId: input.merchant_id,
		orderId: input.order_id,
		payhereAmount: input.payhere_amount,
		payhereCurrency: input.payhere_currency,
		statusCode: input.status_code,
		merchantSecret: config.merchantSecret,
	});

	if (!isPayhereSignatureValid(expectedSignature, input.md5sig)) {
		throw new AppError('PAYHERE_SIGNATURE_INVALID', 400, 'Invalid PayHere signature.');
	}

	const payment = await prisma.payment.findUnique({
		where: { id: input.order_id },
		select: paymentSelect,
	});

	if (!payment) {
		throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found.');
	}
	// Provider retries must never turn a completed refund back into paid access.
	if (payment.status === PaymentStatus.REFUNDED) return payment;

	const expectedAmount = formatPayhereAmount(payment.amount);
	const payhereAmount = formatPayhereAmount(input.payhere_amount);
	const currency = input.payhere_currency.toUpperCase();
	if (expectedAmount !== payhereAmount || currency !== PAYHERE_CURRENCY) {
		throw new AppError('PAYHERE_AMOUNT_MISMATCH', 400, 'Payment amount mismatch.');
	}

	const nextStatus = resolvePayhereStatus(input.status_code);
	if (payment.status === PaymentStatus.SUCCESS && nextStatus !== PaymentStatus.SUCCESS) {
		return payment;
	}

	const updated = await prisma.payment.update({
		where: { id: payment.id },
		data: {
			status: nextStatus,
			payhereId: input.payment_id,
		},
		select: paymentSelect,
	});

	logger.info(
		{
			paymentId: updated.id,
			status: updated.status,
			payhereId: updated.payhereId,
		},
		'PayHere payment updated',
	);

	if (nextStatus === PaymentStatus.SUCCESS) {
		void NotificationService.dispatch({
			type: NotificationType.PAYMENT_CONFIRMED,
			userId: updated.enrollment.userId,
			link: '/payments',
			params: {
				courseName: updated.enrollment.course.name,
				paymentMonth: updated.paymentMonth,
			},
		});
	}

	return updated;
};

export const listPayments = async (
	query: ListPaymentsQuery,
): Promise<PaginatedResult<PaymentSummary>> => {
	const { page, limit, status, paymentMonth, enrollmentId, userId, courseId } = query;
	const skip = (page - 1) * limit;

	const enrollmentFilter: Prisma.EnrollmentWhereInput = {
		...(userId ? { userId } : {}),
		...(courseId ? { courseId } : {}),
	};

	const where: Prisma.PaymentWhereInput = {
		...(status ? { status } : {}),
		...(paymentMonth ? { paymentMonth } : {}),
		...(enrollmentId ? { enrollmentId } : {}),
		...(userId || courseId ? { enrollment: enrollmentFilter } : {}),
	};

	const [data, count] = await Promise.all([
		prisma.payment.findMany({
			where,
			select: paymentSelect,
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit,
		}),
		prisma.payment.count({ where }),
	]);

	return { data, count };
};

export interface MonthPaymentSummary {
	month: string;
	/** Sum of `amount` over SUCCESS payments that month, as a fixed(2) string. */
	collectedTotal: string;
	paidCount: number;
	pendingCount: number;
	failedCount: number;
	refundedCount: number;
}

/**
 * Aggregate the month's payments for the admin dashboard: total collected
 * (SUCCESS only) plus per-status counts. Read-only; SUPER_ADMIN/ADMIN gated at
 * the route.
 */
export const getPaymentsSummary = async (month: string): Promise<MonthPaymentSummary> => {
	const [sum, paidCount, pendingCount, failedCount, refundedCount] = await Promise.all([
		prisma.payment.aggregate({
			_sum: { amount: true, refundedAmount: true },
			where: { paymentMonth: month, status: PaymentStatus.SUCCESS },
		}),
		prisma.payment.count({ where: { paymentMonth: month, status: PaymentStatus.SUCCESS } }),
		prisma.payment.count({ where: { paymentMonth: month, status: PaymentStatus.PENDING } }),
		prisma.payment.count({ where: { paymentMonth: month, status: PaymentStatus.FAILED } }),
		prisma.payment.count({ where: { paymentMonth: month, status: PaymentStatus.REFUNDED } }),
	]);
	const gross = sum._sum.amount ?? new Prisma.Decimal(0);
	const refunded = sum._sum.refundedAmount ?? new Prisma.Decimal(0);

	return {
		month,
		collectedTotal: gross.minus(refunded).toFixed(2),
		paidCount,
		pendingCount,
		failedCount,
		refundedCount,
	};
};

// ─── Financial Reports (Super Admin) ──────────────────────

export interface FinancialReport {
	month: string;
	/** 12 months ending at `month`, zero-filled. */
	trend: { month: string; collected: string; paidCount: number }[];
	byCourse: { courseId: string; name: string; year: number | null; collected: string; paidCount: number }[];
	byMethod: { method: PaymentMethod; collected: string; paidCount: number }[];
	/** Active enrollments with no SUCCESS payment this month. */
	outstanding: { count: number; expected: string };
}

/** The N `YYYY-MM` labels ending at (and including) `month`, oldest first. */
const monthsEndingAt = (month: string, n: number): string[] => {
	const [y, m] = month.split('-').map(Number) as [number, number];
	const labels: string[] = [];
	for (let i = n - 1; i >= 0; i -= 1) {
		const d = new Date(Date.UTC(y, m - 1 - i, 1));
		labels.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
	}
	return labels;
};

const money = (v: unknown): string => new Prisma.Decimal((v as Prisma.Decimal | number | string) ?? 0).toFixed(2);

/**
 * Owner financial report for a month: 12-month revenue trend, per-course and
 * per-method breakdowns (SUCCESS only), and outstanding fees (active
 * enrollments unpaid this month). Read-only; SUPER_ADMIN-gated at the route.
 */
export const getFinancialReport = async (month: string): Promise<FinancialReport> => {
	const trendMonths = monthsEndingAt(month, 12);

	const [trendRows, byCourseRows, methodRows, outstandingRows] = await Promise.all([
		prisma.payment.groupBy({
			by: ['paymentMonth'],
			where: { status: PaymentStatus.SUCCESS, paymentMonth: { in: trendMonths } },
			_sum: { amount: true, refundedAmount: true },
			_count: { _all: true },
		}),
		prisma.$queryRaw<Array<{ id: string; name: string; year: number | null; total: unknown; cnt: bigint }>>`
			SELECT c.id, c.name, c.year, SUM(p.amount - p."refundedAmount") AS total, COUNT(*) AS cnt
			FROM "Payment" p
			JOIN "Enrollment" e ON e.id = p."enrollmentId"
			JOIN "Course" c ON c.id = e."courseId"
			WHERE p.status = 'SUCCESS' AND p."paymentMonth" = ${month}
			GROUP BY c.id, c.name, c.year
			ORDER BY total DESC
		`,
		prisma.payment.groupBy({
			by: ['method'],
			where: { status: PaymentStatus.SUCCESS, paymentMonth: month },
			_sum: { amount: true, refundedAmount: true },
			_count: { _all: true },
		}),
		prisma.$queryRaw<Array<{ cnt: bigint; expected: unknown }>>`
			SELECT COUNT(*) AS cnt, COALESCE(SUM(c."monthlyFee"), 0) AS expected
			FROM "Enrollment" e
			JOIN "Course" c ON c.id = e."courseId"
			WHERE e."isActive" = true
			AND NOT EXISTS (
				SELECT 1 FROM "Payment" p
				WHERE p."enrollmentId" = e.id AND p."paymentMonth" = ${month} AND p.status = 'SUCCESS'
			)
		`,
	]);

	const trendMap = new Map(trendRows.map((r) => [r.paymentMonth, r]));
	const trend = trendMonths.map((m) => {
		const r = trendMap.get(m);
		const gross = new Prisma.Decimal(r?._sum.amount ?? 0);
		const refunded = new Prisma.Decimal(r?._sum.refundedAmount ?? 0);
		return { month: m, collected: gross.minus(refunded).toFixed(2), paidCount: r?._count._all ?? 0 };
	});

	const byCourse = byCourseRows.map((r) => ({
		courseId: r.id,
		name: r.name,
		year: r.year,
		collected: money(r.total),
		paidCount: Number(r.cnt),
	}));

	const byMethod = methodRows.map((r) => ({
		method: r.method,
		collected: new Prisma.Decimal(r._sum.amount ?? 0).minus(r._sum.refundedAmount ?? 0).toFixed(2),
		paidCount: r._count._all,
	}));

	const out = outstandingRows[0];
	const outstanding = { count: Number(out?.cnt ?? 0), expected: money(out?.expected) };

	return { month, trend, byCourse, byMethod, outstanding };
};

export const listMyPayments = async (
	userId: string,
	query: ListMyPaymentsQuery,
): Promise<PaymentSummary[]> => {
	const where: Prisma.PaymentWhereInput = {
		...(query.status ? { status: query.status } : {}),
		...(query.paymentMonth ? { paymentMonth: query.paymentMonth } : {}),
		...(query.enrollmentId ? { enrollmentId: query.enrollmentId } : {}),
		enrollment: { userId },
	};

	return prisma.payment.findMany({
		where,
		select: paymentSelect,
		orderBy: { createdAt: 'desc' },
	});
};

export const getPaymentById = async (
	paymentId: string,
	userId: string,
	role: Role,
): Promise<PaymentSummary> => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
		select: paymentSelect,
	});

	if (!payment) {
		throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found.');
	}

	if (role === Role.STUDENT && payment.enrollment.userId !== userId) {
		throw new AppError('PAYMENT_FORBIDDEN', 403, 'You do not have access to this payment.');
	}

	return payment;
};

export const overridePayment = async (
	paymentId: string,
	input: OverridePaymentInput,
	actingAdminId: string,
): Promise<PaymentSummary> => {
	const updated = await prisma.$transaction(async (tx) => {
		const payment = await tx.payment.findUnique({
			where: { id: paymentId },
			select: { id: true, amount: true, refundedAmount: true, status: true },
		});
		if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found.');
		if (payment.status === PaymentStatus.REFUNDED) {
			throw new AppError('PAYMENT_REFUNDED_IMMUTABLE', 409, 'A fully refunded payment cannot be overridden.');
		}

		const nextAmount = input.amount === undefined ? payment.amount : new Prisma.Decimal(input.amount);
		if (nextAmount.lessThan(payment.refundedAmount)) {
			throw new AppError('PAYMENT_AMOUNT_BELOW_REFUNDED', 409, 'Payment amount cannot be lower than completed refunds.');
		}

		const result = await tx.payment.update({
			where: { id: paymentId },
			data: {
				status: input.status,
				amount: nextAmount,
				note: input.note,
				method: PaymentMethod.MANUAL,
				collectedById: actingAdminId,
			},
			select: paymentSelect,
		});
		await tx.paymentAdjustment.create({
			data: {
				paymentId,
				createdById: actingAdminId,
				type: PaymentAdjustmentType.OVERRIDE,
				statusBefore: payment.status,
				statusAfter: input.status,
				paymentAmountBefore: payment.amount,
				paymentAmountAfter: nextAmount,
				reason: input.note,
			},
		});
		return result;
	});

	void NotificationService.dispatch({
		type: NotificationType.PAYMENT_OVERRIDDEN,
		userId: updated.enrollment.userId,
		link: '/payments',
		params: {
			courseName: updated.enrollment.course.name,
			paymentMonth: updated.paymentMonth,
			status: updated.status,
		},
	});

	return updated;
};

export const collectEntrancePayment = async (
	collectedById: string,
	input: CollectEntrancePaymentInput,
): Promise<PaymentSummary> => {
	const enrollment = await prisma.enrollment.findUnique({
		where: { id: input.enrollmentId },
		include: { course: true },
	});

	if (!enrollment) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
	}

	if (!enrollment.isActive) {
		throw new AppError('ENROLLMENT_NOT_ACTIVE', 400, 'This enrollment is not active.');
	}

	if (input.paymentMonth > getCurrentPaymentMonth()) {
		throw new AppError('FUTURE_MONTH', 400, 'Cannot collect a payment for a future month.');
	}

	const resolvedAmount = input.amount ?? Number(enrollment.course.monthlyFee);

	const existing = await prisma.payment.findUnique({
		where: {
			enrollmentId_paymentMonth: {
				enrollmentId: input.enrollmentId,
				paymentMonth: input.paymentMonth,
			},
		},
	});

	if (existing?.status === PaymentStatus.SUCCESS && existing.payhereId) {
		throw new AppError('ALREADY_PAID_ONLINE', 409, 'This month is already paid online.');
	}
	if (existing?.status === PaymentStatus.REFUNDED) {
		throw new AppError('PAYMENT_REFUNDED_IMMUTABLE', 409, 'This payment was fully refunded and cannot be overwritten.');
	}

	const fields = {
		status: PaymentStatus.SUCCESS,
		method: PaymentMethod.ENTRANCE,
		amount: resolvedAmount,
		collectedById,
		collectedAtInstituteId: input.collectedAtInstituteId ?? null,
		collectedViaBarcode: input.collectedViaBarcode ?? null,
		note: 'Collected at entrance',
	};

	const payment = existing
		? await prisma.payment.update({
				where: { id: existing.id },
				data: fields,
				select: paymentSelect,
			})
		: await prisma.payment.create({
				data: { enrollmentId: input.enrollmentId, paymentMonth: input.paymentMonth, ...fields },
				select: paymentSelect,
			});

	void NotificationService.dispatch({
		type: NotificationType.PAYMENT_CONFIRMED,
		userId: enrollment.userId,
		link: '/payments',
		params: {
			courseName: enrollment.course.name,
			paymentMonth: input.paymentMonth,
		},
	});

	return payment;
};

const normalizeHeader = (header: string): string => {
	return header.toLowerCase().replace(/[\s_-]/g, '');
};

const normalizePaymentMonth = (raw: unknown): string | null => {
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (/^\d{4}-\d{2}$/.test(trimmed)) {
			return trimmed;
		}
		if (/^\d{6}$/.test(trimmed)) {
			return `${trimmed.slice(0, 4)}-${trimmed.slice(4)}`;
		}
	}

	if (typeof raw === 'number' && Number.isFinite(raw)) {
		const asString = raw.toString();
		if (asString.length === 6) {
			return `${asString.slice(0, 4)}-${asString.slice(4)}`;
		}
	}

	return null;
};

const normalizeBulkRow = (raw: Record<string, unknown>): BulkPaymentRow | null => {
	const resolveValue = (value: unknown): unknown => {
		if (value === null || value === undefined) {
			return undefined;
		}
		if (typeof value === 'string' && value.trim() === '') {
			return undefined;
		}
		return value;
	};

	const normalized: Record<string, unknown> = {};
	Object.entries(raw).forEach(([key, value]) => {
		if (!key) {
			return;
		}
		normalized[normalizeHeader(key)] = resolveValue(value);
	});

	const paymentMonth = normalizePaymentMonth(
		normalized.paymentmonth ?? normalized.month ?? normalized.payment,
	);

	const classTypeRaw = normalized.classtype ?? normalized.classtypeid ?? normalized.classtypecode;
	const classType = typeof classTypeRaw === 'string'
		? classTypeRaw.trim().toUpperCase()
		: undefined;

	const toTrimmedString = (value: unknown): string | undefined => {
		if (value === null || value === undefined) return undefined;
		return String(value).trim() || undefined;
	};

	const payload = {
		enrollmentId: toTrimmedString(normalized.enrollmentid),
		indexNumber: normalized.indexnumber ?? normalized.studentindex ?? normalized.index,
		courseId: toTrimmedString(normalized.courseid),
		classType: classType as ClassType | undefined,
		paymentMonth: paymentMonth ?? '',
		amount: normalized.amount ?? normalized.paidamount ?? normalized.paid,
		note: toTrimmedString(normalized.note) ?? toTrimmedString(normalized.remarks),
	};

	const parsed = bulkPaymentRowSchema.safeParse(payload);
	return parsed.success ? parsed.data : null;
};

const resolveEnrollmentForBulkRow = async (
	row: BulkPaymentRow,
): Promise<Prisma.EnrollmentGetPayload<{ include: { course: true; user: true } }>> => {
	if (row.enrollmentId) {
		const enrollment = await prisma.enrollment.findUnique({
			where: { id: row.enrollmentId },
			include: { course: true, user: true },
		});
		if (!enrollment) {
			throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
		}
		return enrollment;
	}

	const user = await prisma.user.findUnique({
		where: { indexNumber: row.indexNumber! },
	});

	if (!user) {
		throw new AppError('USER_NOT_FOUND', 404, 'User not found.');
	}

	const enrollment = await prisma.enrollment.findFirst({
		where: {
			userId: user.id,
			courseId: row.courseId!,
			classType: row.classType!,
		},
		include: { course: true, user: true },
	});

	if (!enrollment) {
		throw new AppError('ENROLLMENT_NOT_FOUND', 404, 'Enrollment not found.');
	}

	return enrollment;
};

export const bulkUploadPayments = async (
	file: Express.Multer.File,
): Promise<BulkUploadResult> => {
	if (!file.originalname.toLowerCase().endsWith('.xlsx') || file.buffer.subarray(0, 2).toString() !== 'PK') {
		throw new AppError(
			'BULK_UPLOAD_INVALID_FILE',
			400,
			'Upload a valid .xlsx workbook. Legacy .xls files are not accepted.',
		);
	}

	let workbookRows: SheetData;
	try {
		workbookRows = await readSheet(file.buffer);
	} catch {
		throw new AppError('BULK_UPLOAD_INVALID_FILE', 400, 'The uploaded .xlsx workbook could not be read.');
	}

	const [headerRow, ...dataRows] = workbookRows;
	if (!headerRow) {
		throw new AppError('BULK_UPLOAD_EMPTY', 400, 'No worksheet rows found in upload.');
	}
	const headers = headerRow.map((value) => String(value ?? '').trim());
	const rows = dataRows
		.filter((row) => row.some((value) => value !== null && String(value).trim() !== ''))
		.map((row) => Object.fromEntries(
			headers.map((header, index) => [header, row[index] ?? '']),
		) as Record<string, unknown>);

	if (!rows.length) {
		throw new AppError('BULK_UPLOAD_EMPTY', 400, 'No rows found in upload.');
	}
	if (rows.length > 5000) {
		throw new AppError('BULK_UPLOAD_TOO_MANY_ROWS', 400, 'A bulk upload may contain at most 5,000 rows.');
	}

	const result: BulkUploadResult = {
		total: rows.length,
		created: 0,
		updated: 0,
		skipped: 0,
		errors: [],
	};

	let rowIndex = 1;
	for (const row of rows) {
		rowIndex += 1;
		const normalized = normalizeBulkRow(row);
		if (!normalized) {
			result.errors.push({ row: rowIndex, message: 'Invalid row format.' });
			continue;
		}

		try {
			const enrollment = await resolveEnrollmentForBulkRow(normalized);
			const amount = normalized.amount ?? Number(enrollment.course.monthlyFee);

			const existing = await prisma.payment.findUnique({
				where: {
					enrollmentId_paymentMonth: {
						enrollmentId: enrollment.id,
						paymentMonth: normalized.paymentMonth,
					},
				},
			});

			if (existing?.status === PaymentStatus.SUCCESS && existing.payhereId) {
				result.skipped += 1;
				continue;
			}
			if (existing?.status === PaymentStatus.REFUNDED) {
				throw new AppError('PAYMENT_REFUNDED_IMMUTABLE', 409, 'Fully refunded payment cannot be overwritten.');
			}

			if (existing) {
				await prisma.payment.update({
					where: { id: existing.id },
					data: {
						amount,
						status: PaymentStatus.SUCCESS,
						method: PaymentMethod.BULK,
						note: normalized.note ?? existing.note,
					},
				});
				result.updated += 1;
				continue;
			}

			await prisma.payment.create({
				data: {
					enrollmentId: enrollment.id,
					paymentMonth: normalized.paymentMonth,
					amount,
					status: PaymentStatus.SUCCESS,
					method: PaymentMethod.BULK,
					note: normalized.note ?? 'Bulk upload',
				},
			});
			result.created += 1;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			result.errors.push({ row: rowIndex, message });
		}
	}

	logger.info(
		{
			total: result.total,
			created: result.created,
			updated: result.updated,
			skipped: result.skipped,
			errors: result.errors.length,
		},
		'Payment bulk upload processed',
	);

	return result;
};
