import { ClassType, PaymentStatus, Prisma, Role } from '@prisma/client';
import xlsx from 'xlsx';
import { prisma } from '@/config/database';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { AppError } from '@/utils/app-error';
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
import { formatPayhereAmount, generatePayhereHash, generatePayhereSignature } from '@/utils/payhere';
import {
	bulkPaymentRowSchema,
	type BulkPaymentRow,
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
	status: PaymentStatus;
	payhereId: string | null;
	paymentMonth: string;
	note: string | null;
	createdAt: Date;
	updatedAt: Date;
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
	status: true,
	payhereId: true,
	paymentMonth: true,
	note: true,
	createdAt: true,
	updatedAt: true,
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

	if (expectedSignature !== input.md5sig.toUpperCase()) {
		throw new AppError('PAYHERE_SIGNATURE_INVALID', 400, 'Invalid PayHere signature.');
	}

	const payment = await prisma.payment.findUnique({
		where: { id: input.order_id },
		select: paymentSelect,
	});

	if (!payment) {
		throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found.');
	}

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
): Promise<PaymentSummary> => {
	const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

	if (!payment) {
		throw new AppError('PAYMENT_NOT_FOUND', 404, 'Payment not found.');
	}

	return prisma.payment.update({
		where: { id: paymentId },
		data: {
			status: input.status,
			amount: input.amount,
			note: input.note,
		},
		select: paymentSelect,
	});
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

const normalizeBulkRow = (raw: Record<string, any>): BulkPaymentRow | null => {
	const resolveValue = (value: any): any => {
		if (value === null || value === undefined) {
			return undefined;
		}
		if (typeof value === 'string' && value.trim() === '') {
			return undefined;
		}
		return value;
	};

	const normalized: Record<string, any> = {};
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

	const payload = {
		enrollmentId: normalized.enrollmentid?.toString().trim() || undefined,
		indexNumber: normalized.indexnumber ?? normalized.studentindex ?? normalized.index,
		courseId: normalized.courseid?.toString().trim() || undefined,
		classType: classType as ClassType | undefined,
		paymentMonth: paymentMonth ?? '',
		amount: normalized.amount ?? normalized.paidamount ?? normalized.paid,
		note: normalized.note?.toString().trim() || normalized.remarks?.toString().trim() || undefined,
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
	const workbook = xlsx.read(file.buffer, { type: 'buffer' });
	const sheetName = workbook.SheetNames[0];

	if (!sheetName) {
		throw new AppError('BULK_UPLOAD_EMPTY', 400, 'No worksheet found in upload.');
	}

	const sheet = workbook.Sheets[sheetName];
	if (!sheet) {
		throw new AppError('BULK_UPLOAD_EMPTY', 400, 'Sheet not found.');
	}
	const rows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

	if (!rows.length) {
		throw new AppError('BULK_UPLOAD_EMPTY', 400, 'No rows found in upload.');
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

			if (existing) {
				await prisma.payment.update({
					where: { id: existing.id },
					data: {
						amount,
						status: PaymentStatus.SUCCESS,
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
