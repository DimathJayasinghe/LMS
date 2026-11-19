import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  enrollmentFindMany,
  enrollmentFindFirst,
  progressFindMany,
  progressUpsert,
  sessionFindMany,
} = vi.hoisted(() => ({
  enrollmentFindMany: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  progressFindMany: vi.fn(),
  progressUpsert: vi.fn(),
  sessionFindMany: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: {
    enrollment: { findMany: enrollmentFindMany, findFirst: enrollmentFindFirst },
    courseContentProgress: { findMany: progressFindMany, upsert: progressUpsert },
    classSession: { findMany: sessionFindMany },
  },
}));

import { listMyLearningCourses, markCourseContentSeen } from './enrollment.service';

const enrollment = {
  id: 'enrollment-1',
  classType: 'ONLINE',
  isActive: true,
  userId: 'student-1',
  courseId: 'course-1',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  course: { id: 'course-1', isActive: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  enrollmentFindMany.mockResolvedValue([enrollment]);
  progressFindMany.mockResolvedValue([
    { courseId: 'course-1', lastSeenAt: new Date('2026-08-10T00:00:00.000Z') },
  ]);
  sessionFindMany.mockResolvedValue([]);
});

describe('listMyLearningCourses', () => {
  it('does no content queries when the student has no current enrollments', async () => {
    enrollmentFindMany.mockResolvedValueOnce([]);

    await expect(listMyLearningCourses('student-1')).resolves.toEqual([]);
    expect(progressFindMany).not.toHaveBeenCalled();
    expect(sessionFindMany).not.toHaveBeenCalled();
  });

  it('counts only ready recordings newer than the learner marker and reports upcoming sessions', async () => {
    sessionFindMany.mockResolvedValueOnce([
      {
        courseId: 'course-1',
        date: new Date('2099-01-02T00:00:00.000Z'),
        videoRecordings: [
          { createdAt: new Date('2026-08-09T00:00:00.000Z') },
          { createdAt: new Date('2026-08-11T00:00:00.000Z') },
        ],
      },
      {
        courseId: 'course-1',
        date: new Date('2099-01-01T00:00:00.000Z'),
        videoRecordings: [],
      },
    ]);

    const result = await listMyLearningCourses('student-1');

    expect(result[0]!.learning).toMatchObject({
      newLessonCount: 1,
      upcomingSessionCount: 2,
      nextSessionAt: new Date('2099-01-01T00:00:00.000Z'),
      latestLessonAt: new Date('2026-08-11T00:00:00.000Z'),
    });
  });
});

describe('markCourseContentSeen', () => {
  it('requires a current active enrollment', async () => {
    enrollmentFindFirst.mockResolvedValueOnce(null);

    await expect(markCourseContentSeen('student-1', 'course-1')).rejects.toMatchObject({
      code: 'ENROLLMENT_NOT_FOUND',
      statusCode: 404,
    });
    expect(progressUpsert).not.toHaveBeenCalled();
  });

  it('upserts a per-student course marker', async () => {
    enrollmentFindFirst.mockResolvedValueOnce({ id: 'enrollment-1' });
    progressUpsert.mockResolvedValueOnce({
      courseId: 'course-1',
      lastSeenAt: new Date('2026-08-20T00:00:00.000Z'),
    });

    await markCourseContentSeen('student-1', 'course-1');

    expect(progressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_courseId: { userId: 'student-1', courseId: 'course-1' } },
        create: { userId: 'student-1', courseId: 'course-1' },
      }),
    );
  });
});
