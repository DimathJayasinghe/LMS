import { AttendanceSource, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assertCourseAccess,
  classSessionFindUnique,
  userFindMany,
  attendanceFindMany,
  attendanceCreateMany,
  listPastMeetingParticipants,
} = vi.hoisted(() => ({
  assertCourseAccess: vi.fn(),
  classSessionFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  attendanceCreateMany: vi.fn(),
  listPastMeetingParticipants: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: {
    classSession: { findUnique: classSessionFindUnique },
    user: { findMany: userFindMany },
    attendance: { findMany: attendanceFindMany, createMany: attendanceCreateMany },
  },
}));
vi.mock('@/services/class.service', () => ({ assertCourseAccess }));
vi.mock('@/utils/zoom-attendance', () => ({ listPastMeetingParticipants }));

import {
  previewZoomAttendance,
  reconcileZoomAttendance,
} from './attendance-reconciliation.service';

const actor = { userId: 'teacher-1', role: Role.TEACHER };
const session = { id: 'session-1', courseId: 'course-1', zoomMeetingId: '987654', deletedAt: null };
const student = {
  id: 'student-1',
  name: 'Nimal',
  email: 'nimal@example.com',
  indexNumber: 42,
  role: Role.STUDENT,
  enrollments: [{ id: 'enrollment-1' }],
};
const zoomRow = {
  name: 'Nimal (#42)',
  userEmail: null,
  joinTime: new Date('2026-08-17T10:00:00Z'),
  leaveTime: new Date('2026-08-17T10:45:00Z'),
  durationSeconds: 2700,
};

beforeEach(() => {
  assertCourseAccess.mockReset().mockResolvedValue(undefined);
  classSessionFindUnique.mockReset().mockResolvedValue(session);
  userFindMany.mockReset().mockResolvedValue([student]);
  attendanceFindMany.mockReset().mockResolvedValue([]);
  attendanceCreateMany.mockReset().mockResolvedValue({ count: 1 });
  listPastMeetingParticipants.mockReset().mockResolvedValue([zoomRow]);
});

describe('previewZoomAttendance', () => {
  it.each([Role.ADMIN, Role.MARKER, Role.STUDENT])('blocks the %s role before reading a session', async (role) => {
    await expect(previewZoomAttendance('session-1', { userId: 'other-1', role })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
    expect(classSessionFindUnique).not.toHaveBeenCalled();
  });

  it('checks course ownership before calling Zoom', async () => {
    assertCourseAccess.mockRejectedValue({ code: 'FORBIDDEN_COURSE', statusCode: 403 });

    await expect(previewZoomAttendance('session-1', actor)).rejects.toMatchObject({
      code: 'FORBIDDEN_COURSE',
    });
    expect(listPastMeetingParticipants).not.toHaveBeenCalled();
  });

  it('rejects missing and unscheduled sessions without calling Zoom', async () => {
    classSessionFindUnique.mockResolvedValueOnce(null);
    await expect(previewZoomAttendance('missing', actor)).rejects.toMatchObject({
      code: 'CLASS_SESSION_NOT_FOUND',
    });

    classSessionFindUnique.mockResolvedValueOnce({ ...session, zoomMeetingId: null });
    await expect(previewZoomAttendance('session-1', actor)).rejects.toMatchObject({
      code: 'LIVE_CLASS_NOT_SCHEDULED',
    });
    expect(listPastMeetingParticipants).not.toHaveBeenCalled();
  });

  it('returns a bounded diff without writing attendance', async () => {
    const result = await previewZoomAttendance('session-1', actor);

    expect(assertCourseAccess).toHaveBeenCalledWith('course-1', actor);
    expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        enrollments: expect.objectContaining({
          where: { courseId: 'course-1', isActive: true },
        }),
      }),
    }));
    expect(result.summary).toMatchObject({ matchedStudents: 1, missing: 1, alreadyRecorded: 0 });
    expect(attendanceCreateMany).not.toHaveBeenCalled();
  });

  it('does not offer a matched student without an active course enrollment for syncing', async () => {
    userFindMany.mockResolvedValue([{ ...student, enrollments: [] }]);

    const result = await previewZoomAttendance('session-1', actor);

    expect(result.summary).toMatchObject({ matchedStudents: 0, missing: 0, unmatched: 1 });
    expect(result.unmatched[0]).toMatchObject({ reason: 'NOT_ENROLLED' });
  });
});

describe('reconcileZoomAttendance', () => {
  it('inserts only missing matched students with Zoom timestamps', async () => {
    const result = await reconcileZoomAttendance('session-1', actor);

    expect(attendanceCreateMany).toHaveBeenCalledWith({
      data: [{
        userId: 'student-1',
        classSessionId: 'session-1',
        source: AttendanceSource.ZOOM_WEBHOOK,
        scannedAt: zoomRow.joinTime,
        lastSeenAt: zoomRow.leaveTime,
      }],
      skipDuplicates: true,
    });
    expect(result.applied).toBe(1);
  });

  it('is safe to repeat after the missing record has already been created', async () => {
    attendanceFindMany.mockResolvedValue([{ userId: student.id }]);
    attendanceCreateMany.mockResolvedValue({ count: 0 });

    const result = await reconcileZoomAttendance('session-1', actor);

    expect(attendanceCreateMany).not.toHaveBeenCalled();
    expect(result.summary.alreadyRecorded).toBe(1);
    expect(result.applied).toBe(0);
  });
});
