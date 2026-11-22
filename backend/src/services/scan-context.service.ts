import { ClassType, EnrollmentScanState } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { isStudentCovered } from '@/services/access.service';
import { createSettingsReader } from '@/services/settings.service';

// ─── What the door needs to know about a scanned student ─────
// A scan warns about three business conditions (not enrolled, enrolled online only, fee not covered)
// and records them on the attendance row; only the organization's policy settings can turn a
// warning into a refusal. Structural refusals (unknown code, deactivated user, wrong institute)
// are the caller's, before this runs.

export type ScanWarning = 'NOT_ENROLLED' | 'MODE_MISMATCH' | 'FEE_IN_GRACE' | 'FEE_UNPAID';
export type ScanBlock = 'SCAN_BLOCKED_NOT_ENROLLED' | 'SCAN_BLOCKED_UNPAID';

export interface ScanContext {
  enrollmentState: EnrollmentScanState;
  /** A SUCCESS payment covers the current billing month (strictly paid, not merely inside grace). */
  paidThisMonth: boolean;
  covered: 'PAID' | 'GRACE' | 'UNPAID';
  month: string;
  graceUntil: string | null;
  warnings: ScanWarning[];
}

export interface ScanEvaluationInput {
  studentId: string;
  courseId: string;
  organizationId: string;
  now: Date;
}

/**
 * Derives the enrollment and fee state of a student at the door of a course's session.
 * The enrollment that counts is the student's active physical one; an online-only enrollment is a
 * mode mismatch (the fee is still checked on it); none at all is not enrolled and has no fee state.
 * Returns the state and, when the settings say so, the refusal for the caller to raise.
 */
export const evaluateScan = async ({ studentId, courseId, organizationId, now }: ScanEvaluationInput): Promise<{ context: ScanContext; block: ScanBlock | null }> => {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: studentId, courseId, isActive: true },
    select: { id: true, classType: true },
  });
  const physical = enrollments.find((e) => e.classType === ClassType.PHYSICAL);
  const chosen = physical ?? enrollments[0];
  const enrollmentState = physical ? EnrollmentScanState.ENROLLED : chosen ? EnrollmentScanState.MODE_MISMATCH : EnrollmentScanState.NOT_ENROLLED;

  const coverage = await isStudentCovered({ userId: studentId, courseId, ...(chosen ? { enrollmentId: chosen.id } : {}), now });

  const warnings: ScanWarning[] = [];
  if (enrollmentState === EnrollmentScanState.NOT_ENROLLED) warnings.push('NOT_ENROLLED');
  else {
    if (enrollmentState === EnrollmentScanState.MODE_MISMATCH) warnings.push('MODE_MISMATCH');
    if (coverage.reason === 'GRACE') warnings.push('FEE_IN_GRACE');
    if (coverage.reason === 'UNPAID') warnings.push('FEE_UNPAID');
  }

  const context: ScanContext = {
    enrollmentState,
    paidThisMonth: coverage.reason === 'PAID',
    covered: coverage.reason,
    month: coverage.month,
    graceUntil: coverage.graceUntil,
    warnings,
  };

  const read = createSettingsReader(organizationId);
  let block: ScanBlock | null = null;
  if (enrollmentState === EnrollmentScanState.NOT_ENROLLED) {
    if (await read('attendance.scan.notEnrolledPolicy') === 'BLOCK') block = 'SCAN_BLOCKED_NOT_ENROLLED';
  } else if (!coverage.covered && await read('attendance.scan.unpaidPolicy') === 'BLOCK') {
    block = 'SCAN_BLOCKED_UNPAID';
  }
  return { context, block };
};

export const assertScanAllowed = (block: ScanBlock | null): void => {
  if (block === 'SCAN_BLOCKED_NOT_ENROLLED') throw new AppError(block, 403, 'This student is not enrolled in this class.');
  if (block === 'SCAN_BLOCKED_UNPAID') throw new AppError(block, 402, "This student's fee for this month is not covered.");
};
