import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import * as PaymentService from '@/services/payment.service';
import {
	initiatePaymentSchema,
	listMyPaymentsQuerySchema,
	listPaymentsQuerySchema,
	overridePaymentSchema,
	payhereNotifySchema,
	paymentIdParamSchema,
} from '@/schemas/payment.schema';

type RequestWithFile = Request & { file?: Express.Multer.File };

export const initiatePayherePayment = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const input = initiatePaymentSchema.parse(req.body);
		const result = await PaymentService.initiatePayherePayment(req.user!.userId, input);

		res.status(200).json({
			status: 'success',
			data: result,
			message: 'PayHere checkout payload generated successfully.',
		});
	},
);

export const handlePayhereNotify = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const input = payhereNotifySchema.parse(req.body);
		const payment = await PaymentService.handlePayhereNotify(input);

		res.status(200).json({
			status: 'success',
			data: payment,
			message: 'Payment notification processed successfully.',
		});
	},
);

export const listPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listPaymentsQuerySchema.parse(req.query);
	const { data, count } = await PaymentService.listPayments(query);

	res.status(200).json({
		status: 'success',
		data,
		count,
	});
});

export const listMyPayments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const query = listMyPaymentsQuerySchema.parse(req.query);
	const payments = await PaymentService.listMyPayments(req.user!.userId, query);

	res.status(200).json({
		status: 'success',
		data: payments,
		count: payments.length,
	});
});

export const getPaymentById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
	const { id } = paymentIdParamSchema.parse(req.params);
	const payment = await PaymentService.getPaymentById(id, req.user!.userId, req.user!.role);

	res.status(200).json({
		status: 'success',
		data: payment,
	});
});

export const getPayhereStatus = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = paymentIdParamSchema.parse(req.params);
		const payment = await PaymentService.getPaymentById(id, req.user!.userId, req.user!.role);

		res.status(200).json({
			status: 'success',
			data: {
				id: payment.id,
				status: payment.status,
				paymentMonth: payment.paymentMonth,
				amount: payment.amount,
				payhereId: payment.payhereId,
			},
		});
	},
);

export const overridePayment = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const { id } = paymentIdParamSchema.parse(req.params);
		const input = overridePaymentSchema.parse(req.body);
		const payment = await PaymentService.overridePayment(id, input);

		res.status(200).json({
			status: 'success',
			data: payment,
			message: 'Payment updated successfully.',
		});
	},
);

export const bulkUploadPayments = asyncHandler(
	async (req: Request, res: Response): Promise<void> => {
		const file = (req as RequestWithFile).file;
		if (!file) {
			res.status(400).json({
				status: 'error',
				message: 'Bulk upload file is required.',
			});
			return;
		}

		const result = await PaymentService.bulkUploadPayments(file);

		res.status(200).json({
			status: 'success',
			data: result,
			message: 'Bulk upload processed successfully.',
		});
	},
);
