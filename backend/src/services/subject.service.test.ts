import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  subjectFindUnique,
  userFindMany,
  courseFindFirst,
  assignmentFindMany,
  assignmentDeleteMany,
  assignmentCreateMany,
  transaction,
} = vi.hoisted(() => ({
  subjectFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  courseFindFirst: vi.fn(),
  assignmentFindMany: vi.fn(),
  assignmentDeleteMany: vi.fn(),
  assignmentCreateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/config/database', () => ({
  prisma: {
    subject: { findUnique: subjectFindUnique },
    user: { findMany: userFindMany },
    course: { findFirst: courseFindFirst },
    subjectTeacher: { findMany: assignmentFindMany },
    $transaction: transaction,
  },
}));

import { replaceSubjectTeachers } from './subject.service';

beforeEach(() => {
  vi.clearAllMocks();
  subjectFindUnique.mockResolvedValue({ id: 'subject-1' });
  userFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(where.id.in.map((id) => ({ id }))),
  );
  courseFindFirst.mockResolvedValue(null);
  assignmentFindMany.mockResolvedValue([]);
  transaction.mockImplementation((callback) =>
    callback({
      subjectTeacher: {
        deleteMany: assignmentDeleteMany,
        createMany: assignmentCreateMany,
      },
    }),
  );
});

describe('replaceSubjectTeachers', () => {
  it('rejects missing, inactive, or non-teacher accounts', async () => {
    userFindMany.mockResolvedValueOnce([{ id: 'teacher-1' }]);

    await expect(
      replaceSubjectTeachers('subject-1', { teacherIds: ['teacher-1', 'invalid-user'] }),
    ).rejects.toMatchObject({ code: 'INVALID_TEACHER_IDS', statusCode: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('prevents removing a teacher who still owns a class in the subject', async () => {
    courseFindFirst.mockResolvedValueOnce({
      id: 'course-1',
      name: '2026 Theory',
      teacherId: 'teacher-old',
    });

    await expect(
      replaceSubjectTeachers('subject-1', { teacherIds: ['teacher-new'] }),
    ).rejects.toMatchObject({ code: 'TEACHER_OWNS_SUBJECT_COURSE', statusCode: 409 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('replaces the exact assignment set and de-duplicates IDs', async () => {
    await replaceSubjectTeachers('subject-1', {
      teacherIds: ['teacher-1', 'teacher-2', 'teacher-1'],
    });

    expect(assignmentDeleteMany).toHaveBeenCalledWith({
      where: {
        subjectId: 'subject-1',
        teacherId: { notIn: ['teacher-1', 'teacher-2'] },
      },
    });
    expect(assignmentCreateMany).toHaveBeenCalledWith({
      data: [
        { subjectId: 'subject-1', teacherId: 'teacher-1' },
        { subjectId: 'subject-1', teacherId: 'teacher-2' },
      ],
      skipDuplicates: true,
    });
  });
});
