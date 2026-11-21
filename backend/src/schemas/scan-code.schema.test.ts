import { describe, expect, it } from 'vitest';
import { scanBarcodeSchema } from './attendance.schema';
import { assignBarcodeSchema, createStudentBarcodeSchema, resolveBarcodeQuerySchema } from './user.schema';

const id = '11111111-1111-4111-8111-111111111111';
const cases = [
  ['scan', (code: string) => scanBarcodeSchema.safeParse({ barcode: code, classSessionId: id, instituteId: id })],
  ['desk resolve', (code: string) => resolveBarcodeQuerySchema.safeParse({ code })],
  ['assign', (code: string) => assignBarcodeSchema.safeParse({ barcode: code })],
  ['institute card', (code: string) => createStudentBarcodeSchema.safeParse({ barcode: code, instituteId: id })],
] as const;

describe.each(cases)('%s scan code', (_name, parse) => {
  it.each(['ABé', 'AB\u0001C'])('rejects a non-printable or non-ASCII code', (code) => {
    expect(parse(code).success).toBe(false);
  });
  it('accepts a trimmed printable code', () => {
    expect(parse('  A_1  ').success).toBe(true);
  });
});
