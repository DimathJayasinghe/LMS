import { AttendanceSource, Prisma, Role } from '@prisma/client';
import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';
import { logger } from '@/config/logger';
import { assertCourseAccess } from '@/services/class.service';
import { assertStudentContentAccess } from '@/services/access.service';
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

const attendanceWithRelationsSelect = {
  ...attendanceSelect,
  user: { select: { id: true, name: true, email: true, indexNumber: true, barcode: true } },
  classSession: { select: { id: true, title: true, date: true, courseId: true } },
} satisfies Prisma.AttendanceSelect;

// ─── Helpers ─────────────────────────────────────────────────

const ensureClassSessionExists = async (sessionId: string): Promise<{ id: string; courseId: string; deletedAt: Date | null }> => {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, courseId: true, deletedAt: true },
  });

  if (!session || session.deletedAt) {
    throw new AppError('CLASS_SESSION_NOT_FOUND', 404, 'Class session not found or has been deleted.');
  }

  return session;
};

// ─── Barcode Scan ────────────────────────────────────────────
// Admin scans a student's barcode at the physical entrance.
// Uses upsert to prevent duplicate records from rapid scans.

export const scanBarcode = async (input: ScanBarcodeInput): Promise<AttendanceRecord> => {
  await ensureClassSessionExists(input.classSessionId);

  // Look up the student by barcode
  const student = await prisma.user.findUnique({
    where: { barcode: input.barcode },
    select: { id: true, deletedAt: true, role: true },
  });

  if (!student) {
    throw new AppError('BARCODE_NOT_FOUND', 404, 'No student found with this barcode. Please verify the barcode is assigned.');
  }

  if (student.deletedAt) {
    throw new AppError('STUDENT_DEACTIVATED', 403, 'This student account has been deactivated.');
  }

  if (student.role !== Role.STUDENT) {
    throw new AppError('INVALID_ROLE_FOR_ATTENDANCE', 400, 'Attendance can only be marked for students.');
  }

  // Upsert prevents duplicates from rapid scans (plan §10)
  return prisma.attendance.upsert({
    where: {
      userId_classSessionId: {
        userId: student.id,
        classSessionId: input.classSessionId,
      },
    },
    create: {
      userId: student.id,
      classSessionId: input.classSessionId,
      source: AttendanceSource.BARCODE,
      scannedAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      lastSeenAt: new Date(),
    },
    select: attendanceWithRelationsSelect,
  });
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
  await ensureClassSessionExists(input.classSessionId);

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
      scannedAt: new Date(),
      lastSeenAt: new Date(),
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
  requestingUserId: string,
  requestingRole: Role,
  query: AttendanceQuery,
): Promise<{ records: AttendanceRecord[]; total: number }> => {
  // Students can only view their own attendance
  if (requestingRole === Role.STUDENT && requestingUserId !== userId) {
    throw new AppError('FORBIDDEN', 403, 'You can only view your own attendance history.');
  }

  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  });

  if (!student) {
    throw new AppError('USER_NOT_FOUND', 404, 'Student not found.');
  }

  const where: Prisma.AttendanceWhereInput = {
    userId,
    classSession: { deletedAt: null },
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
