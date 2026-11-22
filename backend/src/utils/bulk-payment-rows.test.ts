import { beforeEach, describe, expect, it, vi } from 'vitest';

const readSheet = vi.hoisted(() => vi.fn());
vi.mock('read-excel-file/node', () => ({ readSheet }));

import { parseBulkWorkbook } from './bulk-payment-rows';

const ID = '00000000-0000-4000-8000-000000000001';
const xlsx = (name = 'payments.xlsx', bytes: number[] = [0x50, 0x4b, 0x03, 0x04]) =>
  ({ originalname: name, buffer: Buffer.from(bytes) }) as Express.Multer.File;
const HEADER = ['Enrollment ID', 'Payment Month', 'Amount', 'Note'];

beforeEach(() => {
  readSheet.mockReset();
});

describe('parseBulkWorkbook — what is accepted as a file', () => {
  it('rejects a legacy .xls file before parsing', async () => {
    await expect(parseBulkWorkbook(xlsx('payments.xls'), 10)).rejects.toMatchObject({ code: 'BULK_UPLOAD_INVALID_FILE', statusCode: 400 });
    expect(readSheet).not.toHaveBeenCalled();
  });

  it('rejects an .xlsx name whose bytes are not a zip package', async () => {
    await expect(parseBulkWorkbook(xlsx('payments.xlsx', [0x41, 0x42]), 10)).rejects.toMatchObject({ code: 'BULK_UPLOAD_INVALID_FILE' });
    expect(readSheet).not.toHaveBeenCalled();
  });

  it('rejects a workbook the reader cannot open', async () => {
    readSheet.mockRejectedValue(new Error('corrupt'));
    await expect(parseBulkWorkbook(xlsx(), 10)).rejects.toMatchObject({ code: 'BULK_UPLOAD_INVALID_FILE', statusCode: 400 });
  });

  it.each([[[]], [[HEADER]], [[HEADER, ['', '', '', '']]]])('rejects a sheet with no data rows', async (sheet) => {
    readSheet.mockResolvedValue(sheet);
    await expect(parseBulkWorkbook(xlsx(), 10)).rejects.toMatchObject({ code: 'BULK_UPLOAD_EMPTY', statusCode: 400 });
  });
});

describe('parseBulkWorkbook — the row limit', () => {
  const sheetOf = (count: number) => [HEADER, ...Array.from({ length: count }, () => [ID, '2026-11', 2500, ''])];

  it('accepts exactly the limit', async () => {
    readSheet.mockResolvedValue(sheetOf(3));
    expect(await parseBulkWorkbook(xlsx(), 3)).toHaveLength(3);
  });

  it('refuses one row over the limit and names the limit', async () => {
    readSheet.mockResolvedValue(sheetOf(4));
    await expect(parseBulkWorkbook(xlsx(), 3)).rejects.toMatchObject({ code: 'BULK_UPLOAD_TOO_MANY_ROWS', statusCode: 400, message: expect.stringContaining('3') });
  });

  it('does not count blank rows toward the limit', async () => {
    readSheet.mockResolvedValue([HEADER, [ID, '2026-11', '', ''], ['', '', '', ''], [ID, '2026-10', '', '']]);
    expect(await parseBulkWorkbook(xlsx(), 2)).toHaveLength(2);
  });
});

describe('parseBulkWorkbook — reading rows', () => {
  it('normalizes header spelling and returns the typed row', async () => {
    readSheet.mockResolvedValue([HEADER, [ID, '2026-07', 2500, ' Front desk import ']]);
    expect(await parseBulkWorkbook(xlsx(), 10)).toEqual([
      { row: 2, value: { enrollmentId: ID, paymentMonth: '2026-07', amount: 2500, note: 'Front desk import' } },
    ]);
  });

  it('accepts a month written as six digits and a composite key', async () => {
    readSheet.mockResolvedValue([['Index Number', 'Course ID', 'Class Type', 'Month'], [4021, '10000000-0000-4000-8000-000000000001', 'physical', 202607]]);
    expect(await parseBulkWorkbook(xlsx(), 10)).toEqual([
      { row: 2, value: { indexNumber: 4021, courseId: '10000000-0000-4000-8000-000000000001', classType: 'PHYSICAL', paymentMonth: '2026-07' } },
    ]);
  });

  it('keeps the spreadsheet row number when blank rows sit in between', async () => {
    readSheet.mockResolvedValue([HEADER, [ID, '2026-07', '', ''], ['', '', '', ''], [ID, '2026-08', '', '']]);
    const rows = await parseBulkWorkbook(xlsx(), 10);
    expect(rows.map((r) => r.row)).toEqual([2, 4]);
  });

  it('returns null for a row that does not fit the format, with its row number', async () => {
    readSheet.mockResolvedValue([HEADER, ['not-a-uuid', '2026-13', '', ''], [ID, '2026-07', '', '']]);
    const rows = await parseBulkWorkbook(xlsx(), 10);
    expect(rows[0]).toEqual({ row: 2, value: null });
    expect(rows[1]?.value).not.toBeNull();
  });

  it('rejects a zero or negative amount as an invalid row', async () => {
    readSheet.mockResolvedValue([HEADER, [ID, '2026-07', 0, ''], [ID, '2026-07', -5, '']]);
    expect((await parseBulkWorkbook(xlsx(), 10)).map((r) => r.value)).toEqual([null, null]);
  });
});
