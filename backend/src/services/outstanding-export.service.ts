import { Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { AUDIT_ACTION } from '@/utils/constants';
import { csvRow } from '@/utils/csv';
import { logInTransaction } from '@/services/audit.service';
import { listOutstanding } from '@/services/outstanding.service';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { AuditContext } from '@/types/audit.types';

/** The file is built in memory; a bigger list should be narrowed to a course first. */
export const OUTSTANDING_EXPORT_MAX_ROWS = 20_000;

const HEADER = ['Index number', 'Student', 'Mobile', 'Course', 'Mode', 'Months owed', 'Fee per month', 'Total owed', 'In grace'];

/** Owner-only CSV of who owes (D-OPS-1). The audit row is written before the file is handed over. */
export const exportOutstandingCsv = async (
  actor: AuthenticatedUser,
  query: { month?: string; courseId?: string },
  context: AuditContext,
): Promise<{ filename: string; csv: string }> => {
  if (actor.role !== Role.SUPER_ADMIN) throw new AppError('FORBIDDEN', 403, 'Only the owner can export who owes fees.');
  const { month, data } = await listOutstanding(actor, { ...query, page: 1, limit: OUTSTANDING_EXPORT_MAX_ROWS + 1 });
  if (data.length > OUTSTANDING_EXPORT_MAX_ROWS) {
    throw new AppError('EXPORT_TOO_LARGE', 409, 'Too many rows to export at once. Choose a course and export again.');
  }
  await prisma.$transaction((tx) => logInTransaction(tx, {
    action: AUDIT_ACTION.OUTSTANDING_EXPORTED, description: 'Who-owes list exported', context,
    metadata: { month, ...(query.courseId ? { courseId: query.courseId } : {}), rows: data.length },
  }));
  const lines = data.map((r) => csvRow([r.indexNumber, r.studentName, r.phone, r.courseName, r.classType, r.monthsOwed, r.amount, r.totalOwed, r.inGrace ? 'yes' : 'no']));
  return { filename: `outstanding-${month}.csv`, csv: csvRow(HEADER) + lines.join('') };
};
