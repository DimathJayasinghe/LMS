import crypto from 'crypto';
import { Prisma } from '@prisma/client';

interface PayhereHashInput {
	merchantId: string;
	orderId: string;
	amount: Prisma.Decimal | number | string;
	currency: string;
	merchantSecret: string;
}

interface PayhereSignatureInput {
	merchantId: string;
	orderId: string;
	payhereAmount: string;
	payhereCurrency: string;
	statusCode: number;
	merchantSecret: string;
}

const md5 = (input: string): string => {
	return crypto.createHash('md5').update(input).digest('hex');
};

export const formatPayhereAmount = (amount: Prisma.Decimal | number | string): string => {
	const decimal = new Prisma.Decimal(amount);
	return decimal.toFixed(2);
};

export const generatePayhereHash = (input: PayhereHashInput): string => {
	const hashedSecret = md5(input.merchantSecret).toUpperCase();
	const amount = formatPayhereAmount(input.amount);
	const raw = `${input.merchantId}${input.orderId}${amount}${input.currency}${hashedSecret}`;
	return md5(raw).toUpperCase();
};

export const generatePayhereSignature = (input: PayhereSignatureInput): string => {
	const hashedSecret = md5(input.merchantSecret).toUpperCase();
	const raw = `${input.merchantId}${input.orderId}${input.payhereAmount}${input.payhereCurrency}${input.statusCode}${hashedSecret}`;
	return md5(raw).toUpperCase();
};

export const isPayhereSignatureValid = (
	expectedSignature: string,
	receivedSignature: string,
): boolean => {
	const expected = Buffer.from(expectedSignature, 'utf8');
	const received = Buffer.from(receivedSignature.toUpperCase(), 'utf8');

	if (expected.length !== received.length) {
		return false;
	}

	return crypto.timingSafeEqual(expected, received);
};
