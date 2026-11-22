import { AttendanceSource, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { logger } from '@/config/logger';
import { assertCourseAccess } from '@/services/class.service';
import { assertStudentContentAccess } from '@/services/access.service';
import { resolveStudentByCode } from '@/services/scan-code.service';
import { assertScanAllowed, evaluateScan, type ScanContext } from '@/services/scan-context.service';
import { DEFAULT_ORGANIZATION_ID } from '@/utils/constants';
import type { AuthenticatedUser } from '@/types/auth.types';
import type { ScanBarcodeInput, ManualAttendanceInput, AttendanceQuery } from '@/schemas/attendance.schema';

// ─── Return type for attendance records ──────────────────────
interface AttendanceRecord {
  id: string;
  source: AttendanceSource;
  scannedAt: Date;
  lastSeenAt: Date;
  userId: string;
  classSessionId: string;
  createdAt: Date;
  updatedAt: Date;
  user?: { id: string; name: string; email: string; indexNumber: number; barcode: string | null };
  classSession?: { id: string; title: string; date: Date; courseId: string };
}

/** A history row as served to the reader of one student's attendance. */
type AttendanceHistoryRecord = Omit<AttendanceRecord, 'user'> & {
  user?: { id: string; name: string; indexNumber: number };
};

const attendanceSelect = {
  id: true,
  source: true,
  scannedAt: true,
  lastSeenAt: true,
  userId: true,
  classSessionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttendanceSelect;

// Per-student history: only the identity fields the reader needs (no email or barcode).
const attendanceStudentViewSelect = {
  ...attendanceSelect,
  user: { select: { id: true, name: true, indexNumber: true } },
  classSession: { select: { id: true, title: true, date: true, courseId: true } },
} satisfies Prisma.AttendanceSelect;

const attendanceWithRelationsSelect = {
  ...attendanceSelect,
  user: { select: { id: true, name: true, email: true, indexNumber: true, barcode: true } },
  classSession: { select: { id: true, title: true, date: true, courseId: true } },
} satisfies Prisma.AttendanceSelect;

// The scanner also shows the student's photo so the clerk can compare faces at the door.
const scanSelect = {
  ...attendanceWithRelationsSelect,
  user: { select: { ...attendanceWithRelationsSelect.user.select, profileImage: true } },
} satisfies Prisma.AttendanceSelect;

/** What the scanner shows after a scan: the enrollment and fee state, and the face to compare. */
export type ScanResult = {
  attendance: AttendanceRecord;
  context: ScanContext & { student: { name: string; indexNumber: number; profileImage: string | null } };
};

// ─── Helpers ─────────────────────────────────────────────────

const ensureClassSessionExists = async (
  sessionId: string,
): Promise<{
  id: string;
  courseId: string;
  organizationId: string;
  deletedAt: Date | null;
  timetableSlot: { instituteId: string | null } | null;
}> => {
  const found = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      courseId: true,
      deletedAt: true,
      timetableSlot: { select: { instituteId: true } },
      course: { select: { organizationId: true } },
    },
  });
  const session = found && { ...found, organizationId: found.course?.organizationId ?? DEFAULT_ORGANIZATION_ID };

  if (!session || session.deletedAt) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found or has been deleted.');
  }

  return session;
};

// ─── Barcode Scan ────────────────────────────────────────────
// Admin scans a student's barcode at the physical entrance.
// Uses upsert to prevent duplicate records from rapid scans.

export const scanBarcode = async (input: ScanBarcodeInput): Promise<ScanResult> => {
  const session = await ensureClassSessionExists(input.classSessionId);

  const institute = await prisma.institute.findUnique({
    where: { id: input.instituteId },
    select: { id: true, isActive: true },
  });

  if (!institute || !institute.isActive) {
    throw new AppError('INSTITUTE_NOT_FOUND', 404, 'Institute not found or inactive.');
  }

  if (
    session.timetableSlot?.instituteId &&
    session.timetableSlot.instituteId !== input.instituteId
  ) {
    throw new AppError(
      'SESSION_INSTITUTE_MISMATCH',
      409,
      'This class session is scheduled at a different institute.',
    );
  }

  // One resolver for both code kinds: a code held by several students is refused, never guessed.
  const { student } = await resolveStudentByCode(input.barcode);

  if (student.deletedAt) {
    throw new AppError('STUDENT_DEACTIVATED', 403, 'This student account has been deactivated.');
  }

  if (student.role !== Role.STUDENT) {
    throw new AppError('INVALID_ROLE_FOR_ATTENDANCE', 400, 'Attendance can only be marked for students.');
  }

  // The door warns about enrollment and fees and records them; only the organization's policies refuse.
  const now = new Date();
  const { context, block } = await evaluateScan({ studentId: student.id, courseId: session.courseId, organizationId: session.organizationId, now });
  assertScanAllowed(block);

  // Upsert prevents duplicates from rapid scans (plan §10). The snapshot is taken on the first scan only.
  const record = await prisma.attendance.upsert({
    where: {
      userId_classSessionId: {
        userId: student.id,
        classSessionId: input.classSessionId,
      },
    },
    create: {
      userId: student.id,
      classSessionId: input.classSessionId,
      source: input.source,
      scannedAt: now,
      lastSeenAt: now,
      instituteId: input.instituteId,
      enrollmentStateAtScan: context.enrollmentState,
      paidAtScan: context.paidThisMonth,
    },
    update: {
      lastSeenAt: now,
    },
    select: scanSelect,
  });

  const { profileImage, name, indexNumber } = record.user;
  return { attendance: record, context: { ...context, student: { name, indexNumber, profileImage } } };
};

// ─── Zoom Webhook ────────────────────────────────────────────
// Zoom fires a webhook when a participant joins a meeting.
// A student may reconnect 45+ times — upsert keeps it to 1 record.

export const handleZoomWebhook = async (
  meetingId: string,
  participantEmail: string | undefined,
  joinTime: Date | undefined,
): Promise<AttendanceRecord | null> => {
  // Match the Zoom meeting ID to a class session
  const classSession = await prisma.classSession.findFirst({
    where: { zoomMeetingId: meetingId, deletedAt: null },
    select: { id: true },
  });

  if (!classSession) {
    // Not an error — Zoom may fire webhooks for meetings we don't track
    logger.warn({ meetingId }, 'Zoom webhook received for unknown meeting ID — ignoring.');
    return null;
  }

  // Identify the student by their email
  if (!participantEmail) {
    logger.warn({ meetingId }, 'Zoom webhook missing participant email — cannot match student.');
    return null;
  }

  const student = await prisma.user.findFirst({
    where: { email: participantEmail, deletedAt: null, role: Role.STUDENT },
    select: { id: true },
  });

  if (!student) {
    // Non-student participants (admins, guests) — silently ignore
    logger.info({ meetingId, participantEmail }, 'Zoom participant is not a registered student — skipping.');
    return null;
  }

  const now = joinTime ?? new Date();

  // Upsert handles Zoom's reconnect storm (plan §10):
  // 45 rapid reconnects → still only 1 attendance record
  return prisma.attendance.upsert({
    where: {
      userId_classSessionId: {
        userId: student.id,
        classSessionId: classSession.id,
      },
    },
    create: {
      userId: student.id,
      classSessionId: classSession.id,
      source: AttendanceSource.ZOOM_WEBHOOK,
      scannedAt: now,
      lastSeenAt: now,
    },
    update: {
      lastSeenAt: now,
    },
    select: attendanceSelect,
  });
};

// ─── Manual Attendance ───────────────────────────────────────
// Admin can manually mark a student as present (e.g., reconciliation)

export const markManualAttendance = async (input: ManualAttendanceInput): Promise<AttendanceRecord> => {
  const session = await ensureClassSessionExists(input.classSessionId);

  const student = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, deletedAt: true, role: true },
  });

  if (!student) {
    throw new AppError('USER_NOT_FOUND', 404, 'Student not found.');
  }

  if (student.deletedAt) {
    throw new AppError('STUDENT_DEACTIVATED', 403, 'This student account has been deactivated.');
  }

  if (student.role !== Role.STUDENT) {
    throw new AppError('INVALID_ROLE_FOR_ATTENDANCE', 400, 'Attendance can only be marked for students.');
  }

  // A staff mark is never refused for enrollment or fees; the state is only recorded, as at the door.
  const now = new Date();
  const { context } = await evaluateScan({ studentId: input.userId, courseId: session.courseId, organizationId: session.organizationId, now });

  return prisma.attendance.upsert({
    where: {
      userId_classSessionId: {
        userId: input.userId,
        classSessionId: input.classSessionId,
      },
    },
    create: {
      userId: input.userId,
      classSessionId: input.classSessionId,
      source: AttendanceSource.MANUAL,
      scannedAt: now,
      lastSeenAt: now,
      enrollmentStateAtScan: context.enrollmentState,
      paidAtScan: context.paidThisMonth,
    },
    update: {
      lastSeenAt: new Date(),
      source: AttendanceSource.MANUAL,
    },
    select: attendanceWithRelationsSelect,
  });
};

// ─── Video Attendance ────────────────────────────────────────
// Mark attendance when a student watches a recorded class video.
// Source is MANUAL since it's triggered by the system on video watch.

export const markVideoAttendance = async (
  actor: AuthenticatedUser,
  classSessionId: string,
): Promise<AttendanceRecord> => {
  const session = await ensureClassSessionExists(classSessionId);

  // A student can only mark video-attendance for a course they're enrolled in.
  // (Payment is already enforced when the stream token is issued, so enrollment
  // is the right gate here.) Non-students fall through the assertion.
  await assertStudentContentAccess(actor, session.courseId, { requirePaid: false });

  return prisma.attendance.upsert({
    where: {
      userId_classSessionId: { userId: actor.userId, classSessionId },
    },
    create: {
      userId: actor.userId,
      classSessionId,
      source: AttendanceSource.ZOOM_WEBHOOK, // Video attendance uses same source as online
      scannedAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      lastSeenAt: new Date(),
    },
    select: attendanceSelect,
  });
};

// ─── Get Attendance for a Class Session ──────────────────────

export const getAttendanceBySession = async (
  sessionId: string,
  actor: AuthenticatedUser,
): Promise<AttendanceRecord[]> => {
  const session = await ensureClassSessionExists(sessionId);
  await assertCourseAccess(session.courseId, actor);

  return prisma.attendance.findMany({
    where: { classSessionId: sessionId },
    select: attendanceWithRelationsSelect,
    orderBy: { scannedAt: 'asc' },
  });
};

// ─── Get Attendance for All Sessions in a Course ─────────────

export const getAttendanceByCourse = async (
  courseId: string,
  query: AttendanceQuery,
  actor: AuthenticatedUser,
): Promise<{ records: AttendanceRecord[]; total: number }> => {
  // Throws CLASS_NOT_FOUND (404) if missing, FORBIDDEN_COURSE (403) if a
  // TEACHER doesn't own it. SUPER_ADMIN/ADMIN pass through unchecked.
  await assertCourseAccess(courseId, actor);

  const where: Prisma.AttendanceWhereInput = {
    classSession: { courseId, deletedAt: null },
  };

  const [records, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      select: attendanceWithRelationsSelect,
      orderBy: { scannedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.attendance.count({ where }),
  ]);

  return { records, total };
};

// ─── Get Attendance History for a Student ────────────────────

export const getStudentAttendance = async (
  userId: string,
  actor: AuthenticatedUser,
  query: AttendanceQuery,
): Promise<{ records: AttendanceHistoryRecord[]; total: number }> => {
  // Role gate first, before any lookup. Markers have no use for attendance history.
  if (actor.role === Role.MARKER) {
    throw new AppError('FORBIDDEN_ROLE', 403, 'You do not have permission to view attendance history.');
  }
  // Students can only view their own attendance.
  if (actor.role === Role.STUDENT && actor.userId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only view your own attendance history.');
  }

  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, deletedAt: true },
  });

  // A staff id is indistinguishable from a missing one. Owner and front desk may
  // still read a deactivated student's history (it survives deactivation).
  const readsDeleted = actor.role === Role.SUPER_ADMIN || actor.role === Role.ADMIN;
  if (!student || student.role !== Role.STUDENT || (student.deletedAt && !readsDeleted)) {
    throw new AppError('USER_NOT_FOUND', 404, 'Student not found.');
  }

  const where: Prisma.AttendanceWhereInput = {
    userId,
    classSession: {
      deletedAt: null,
      // A teacher sees only rows from the courses they teach.
      ...(actor.role === Role.TEACHER ? { course: { teacherId: actor.userId } } : {}),
    },
  };

  const [records, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      select: attendanceStudentViewSelect,
      orderBy: { scannedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.attendance.count({ where }),
  ]);

  return { records, total };
};
