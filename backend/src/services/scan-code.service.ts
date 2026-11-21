import type { Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { DEFAULT_ORGANIZATION_ID } from '@/utils/constants';
import { withAdvisoryLock } from '@/utils/advisory-lock';

// ─── Scan identity ───────────────────────────────────────────
// A scan code identifies exactly one student, whichever kind of code it is
// (the LMS card in `User.barcode` or an institute card in `StudentBarcode`).
// This is the only place that reads or guards those two tables for that purpose.

/** The card format written at registration (`LMS-<index>`); reserved so nobody can register it ahead of time. */
export const LMS_CODE_PATTERN = /^LMS-\d+$/i;

const SCAN_CODE_LOCK_NAMESPACE = 'scan-code';

export const normalizeScanCode = (raw: string): string => raw.trim();

const unavailable = (): AppError => new AppError('CODE_UNAVAILABLE', 409, 'This code is unavailable.');

const studentSelect = {
  id: true,
  name: true,
  indexNumber: true,
  role: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

export interface ScanStudent {
  id: string;
  name: string;
  indexNumber: number;
  role: Role;
  deletedAt: Date | null;
}

export interface ResolvedScanStudent {
  student: ScanStudent;
  /** Set only when exactly one institute card of this student matched. */
  instituteId: string | null;
  matchedBarcode: string;
}

/**
 * Resolves a scanned code to one student. Several holders is an error, never a guess:
 * the caller falls back to searching by index number or name. A deactivated or non-student
 * holder still counts as a holder, and a lone one is returned so each caller keeps its own refusal.
 */
export const resolveStudentByCode = async (rawCode: string): Promise<ResolvedScanStudent> => {
  const code = normalizeScanCode(rawCode);

  const [userIds, cardIds] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE upper("barcode") = upper(${code})`,
    prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "StudentBarcode" WHERE upper("barcode") = upper(${code})`,
  ]);
  const [userMatches, cardMatches] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds.map(({ id }) => id) } }, select: studentSelect }),
    prisma.studentBarcode.findMany({
      where: { id: { in: cardIds.map(({ id }) => id) } },
      select: { instituteId: true, user: { select: studentSelect } },
    }),
  ]);

  const holders = new Map<string, ScanStudent>();
  for (const user of userMatches) holders.set(user.id, user);
  for (const card of cardMatches) holders.set(card.user.id, card.user);

  if (holders.size === 0) {
    throw new AppError(
      'BARCODE_NOT_FOUND',
      404,
      'No student found with this barcode. Please verify the barcode is assigned.',
    );
  }

  if (holders.size > 1) {
    throw new AppError(
      'AMBIGUOUS_CODE',
      409,
      'This code matches more than one student. Search by index number or name instead.',
    );
  }

  const student = [...holders.values()][0]!;
  const ownCards = cardMatches.filter((card) => card.user.id === student.id);

  return {
    student,
    instituteId: ownCards.length === 1 ? ownCards[0]!.instituteId : null,
    matchedBarcode: code,
  };
};

export interface AssertScanCodeFreeOptions {
  /** The user the code is being written for; their own rows never count as a collision. */
  exceptUserId?: string;
  /** Only the registration card writer sets this: it is the one writer allowed to use `LMS-<n>`. */
  allowLmsFormat?: boolean;
}

/**
 * Write-time guard for every code writer. Call it inside the writer's transaction, before the write:
 * it takes the per-code lock, so a concurrent writer of the same code waits and then sees this row.
 * The message never names the other holder.
 */
export const assertScanCodeFree = async (
  tx: Prisma.TransactionClient,
  rawCode: string,
  options: AssertScanCodeFreeOptions,
): Promise<void> => {
  const code = normalizeScanCode(rawCode);

  // Printable ASCII codes use the same uppercase folding in JavaScript and supported PostgreSQL collations.
  await withAdvisoryLock(tx, SCAN_CODE_LOCK_NAMESPACE, DEFAULT_ORGANIZATION_ID, code.toUpperCase());

  if (!options.allowLmsFormat && LMS_CODE_PATTERN.test(code)) {
    throw unavailable();
  }

  const exceptUserId = options.exceptUserId ?? '';
  const [heldAsCard, heldAsInstituteCard] = await Promise.all([
    tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE upper("barcode") = upper(${code}) AND (${exceptUserId} = '' OR "id"::text <> ${exceptUserId})`,
    tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "StudentBarcode" WHERE upper("barcode") = upper(${code}) AND (${exceptUserId} = '' OR "userId"::text <> ${exceptUserId})`,
  ]);

  if (heldAsCard.length || heldAsInstituteCard.length) {
    throw unavailable();
  }
};
