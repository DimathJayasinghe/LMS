import { readSheet, type SheetData } from 'read-excel-file/node';
import type { ClassType } from '@prisma/client';
import { AppError } from '@/utils/app-error';
import { bulkPaymentRowSchema, type BulkPaymentRow } from '@/schemas/payment.schema';

/** One data row of the sheet. `row` is the spreadsheet row number (the header is row 1); `value` is null when the row does not fit the format. */
export interface BulkSheetRow {
  row: number;
  value: BulkPaymentRow | null;
}

const normalizeHeader = (header: string): string => header.toLowerCase().replace(/[\s_-]/g, '');

const normalizePaymentMonth = (raw: unknown): string | null => {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{6}$/.test(trimmed)) return `${trimmed.slice(0, 4)}-${trimmed.slice(4)}`;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const asString = raw.toString();
    if (asString.length === 6) return `${asString.slice(0, 4)}-${asString.slice(4)}`;
  }
  return null;
};

const blankToUndefined = (value: unknown): unknown =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '') ? undefined : value;

const toTrimmedString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return String(value).trim() || undefined;
};

const normalizeBulkRow = (raw: Record<string, unknown>): BulkPaymentRow | null => {
  const normalized: Record<string, unknown> = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (key) normalized[normalizeHeader(key)] = blankToUndefined(value);
  });

  const classTypeRaw = normalized.classtype ?? normalized.classtypeid ?? normalized.classtypecode;
  const parsed = bulkPaymentRowSchema.safeParse({
    enrollmentId: toTrimmedString(normalized.enrollmentid),
    indexNumber: normalized.indexnumber ?? normalized.studentindex ?? normalized.index,
    courseId: toTrimmedString(normalized.courseid),
    classType: (typeof classTypeRaw === 'string' ? classTypeRaw.trim().toUpperCase() : undefined) as ClassType | undefined,
    paymentMonth: normalizePaymentMonth(normalized.paymentmonth ?? normalized.month ?? normalized.payment) ?? '',
    amount: normalized.amount ?? normalized.paidamount ?? normalized.paid,
    note: toTrimmedString(normalized.note) ?? toTrimmedString(normalized.remarks),
  });
  return parsed.success ? parsed.data : null;
};

const isBlank = (row: unknown[]): boolean => !row.some((value) => value !== null && String(value).trim() !== '');

/**
 * Reads the first sheet of an uploaded .xlsx into typed rows. Nothing in the file is trusted: the name and the zip signature are
 * checked before parsing, blank rows are skipped without shifting the row numbers shown in errors, and the row limit applies
 * to data rows only.
 */
export const parseBulkWorkbook = async (file: Express.Multer.File, maxRows: number): Promise<BulkSheetRow[]> => {
  if (!file.originalname.toLowerCase().endsWith('.xlsx') || file.buffer.subarray(0, 2).toString() !== 'PK') {
    throw new AppError('BULK_UPLOAD_INVALID_FILE', 400, 'Upload a valid .xlsx workbook. Legacy .xls files are not accepted.');
  }

  let sheet: SheetData;
  try {
    sheet = await readSheet(file.buffer);
  } catch {
    throw new AppError('BULK_UPLOAD_INVALID_FILE', 400, 'The uploaded .xlsx workbook could not be read.');
  }

  const [headerRow, ...dataRows] = sheet;
  if (!headerRow) throw new AppError('BULK_UPLOAD_EMPTY', 400, 'No worksheet rows found in upload.');
  const headers = headerRow.map((value) => String(value ?? '').trim());

  const rows = dataRows
    .map((cells, index) => ({ cells, row: index + 2 }))
    .filter(({ cells }) => !isBlank(cells));
  if (!rows.length) throw new AppError('BULK_UPLOAD_EMPTY', 400, 'No rows found in upload.');
  if (rows.length > maxRows) {
    throw new AppError('BULK_UPLOAD_TOO_MANY_ROWS', 400, `A bulk upload may contain at most ${maxRows} rows.`);
  }

  return rows.map(({ cells, row }) => ({
    row,
    value: normalizeBulkRow(Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))),
  }));
};
