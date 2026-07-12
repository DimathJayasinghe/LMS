import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';

const { classSessionFindUnique, enrollmentFindFirst, attendanceUpsert } = vi.hoisted(() => ({
  classSessionFindUnique: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  attendanceUpsert: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: {
    classSession: { findUnique: classSessionFindUnique },
    enrollment: { findFirst: enrollmentFindFirst },
    attendance: { upsert: attendanceUpsert },
  },
}));

import { markVideoAttendance } from './attendance.service';

const STUDENT = { userId: 'stu-1', role: Role.STUDENT };
const session = { id: 'sess-1', courseId: 'course-1', deletedAt: null };

beforeEach(() => {
  classSessionFindUnique.mockReset().mockResolvedValue(session);
  enrollmentFindFirst.mockReset();
  attendanceUpsert.mockReset().mockResolvedValue({ id: 'att-1', userId: 'stu-1', classSessionId: 'sess-1' });
});

describe('markVideoAttendance — enrollment gate', () => {
  it('records attendance for a student enrolled in the session course', async () => {
    enrollmentFindFirst.mockResolvedValue({ id: 'enr-1' });
    await expect(markVideoAttendance(STUDENT, 'sess-1')).resolves.toMatchObject({ id: 'att-1' });
    expect(enrollmentFindFirst).toHaveBeenCalledWith({
      where: { userId: 'stu-1', courseId: 'course-1', isActive: true },
      select: { id: true },
    });
    expect(attendanceUpsert).toHaveBeenCalled();
  });

  it('rejects a student not enrolled in the course (no attendance written)', async () => {
    enrollmentFindFirst.mockResolvedValue(null);
    await expect(markVideoAttendance(STUDENT, 'sess-1')).rejects.toMatchObject({
      code: 'NOT_ENROLLED',
      statusCode: 403,
    });
    expect(attendanceUpsert).not.toHaveBeenCalled();
  });

  it('404s on a missing/deleted session before any gate', async () => {
    classSessionFindUnique.mockResolvedValue(null);
    await expect(markVideoAttendance(STUDENT, 'sess-x')).rejects.toMatchObject({
      code: 'CLASS_SESSION_NOT_FOUND',
      statusCode: 404,
    });
    expect(enrollmentFindFirst).not.toHaveBeenCalled();
  });
});
