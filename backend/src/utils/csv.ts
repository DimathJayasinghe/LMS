const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (leading `= + - @`, tab or CR) gets a leading
 * apostrophe so a student name or note cannot execute when the owner opens the export. Numbers are written as is.
 */
export const csvCell = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const csvRow = (cells: (string | number | boolean | null | undefined)[]): string => `${cells.map(csvCell).join(',')}\r\n`;
