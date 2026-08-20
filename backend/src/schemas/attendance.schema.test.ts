import { describe, expect, it } from 'vitest';
import { scanBarcodeSchema } from './attendance.schema';

const validScan = {
	barcode: 'INST-001',
	classSessionId: '11111111-1111-4111-8111-111111111111',
	instituteId: '22222222-2222-4222-8222-222222222222',
};

describe('scanBarcodeSchema', () => {
	it('defaults older clients to BARCODE when source is omitted', () => {
		expect(scanBarcodeSchema.parse(validScan).source).toBe('BARCODE');
	});

	it('accepts QR as the camera scan source', () => {
		expect(scanBarcodeSchema.parse({ ...validScan, source: 'QR' }).source).toBe('QR');
	});

	it('requires institute context', () => {
		const withoutInstitute: Partial<typeof validScan> = { ...validScan };
		delete withoutInstitute.instituteId;
		expect(scanBarcodeSchema.safeParse(withoutInstitute).success).toBe(false);
	});

	it('rejects sources that are not physical scan modes', () => {
		expect(scanBarcodeSchema.safeParse({ ...validScan, source: 'MANUAL' }).success).toBe(false);
	});
});
