import crypto from 'crypto';
import { describe, it, expect, vi } from 'vitest';
import { generatePayhereSignature, isPayhereSignatureValid } from './payhere';

describe('isPayhereSignatureValid', () => {
	it('accepts a matching PayHere signature case-insensitively', () => {
		const expected = generatePayhereSignature({
			merchantId: 'merchant-1',
			orderId: 'payment-1',
			payhereAmount: '2500.00',
			payhereCurrency: 'LKR',
			statusCode: 2,
			merchantSecret: 'secret',
		});

		expect(isPayhereSignatureValid(expected, expected.toLowerCase())).toBe(true);
	});

	it('uses timingSafeEqual for equal-length signatures', () => {
		const spy = vi.spyOn(crypto, 'timingSafeEqual');
		const expected = 'A'.repeat(32);
		const received = 'A'.repeat(31) + 'B';

		expect(isPayhereSignatureValid(expected, received)).toBe(false);
		expect(spy).toHaveBeenCalledWith(Buffer.from(expected), Buffer.from(received));

		spy.mockRestore();
	});

	it('rejects a different-length signature before calling timingSafeEqual', () => {
		const spy = vi.spyOn(crypto, 'timingSafeEqual');

		expect(isPayhereSignatureValid('A'.repeat(32), 'short')).toBe(false);
		expect(spy).not.toHaveBeenCalled();

		spy.mockRestore();
	});
});
