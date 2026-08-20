import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildReconciliationPreview } from './attendance-reconciliation';
import type { ZoomPastParticipant } from './zoom-attendance';

const row = (overrides: Partial<ZoomPastParticipant> = {}): ZoomPastParticipant => ({
  name: 'Nimal Perera (#42)',
  userEmail: null,
  joinTime: new Date('2026-08-17T10:00:00Z'),
  leaveTime: new Date('2026-08-17T10:20:00Z'),
  durationSeconds: 1200,
  ...overrides,
});

const student = {
  id: 'student-1',
  name: 'Nimal Perera',
  email: 'nimal@example.com',
  indexNumber: 42,
  role: Role.STUDENT,
  isEnrolled: true,
};

describe('buildReconciliationPreview', () => {
  it('matches the server-controlled index suffix and aggregates reconnect rows', () => {
    const result = buildReconciliationPreview(
      [
        row(),
        row({
          joinTime: new Date('2026-08-17T10:25:00Z'),
          leaveTime: new Date('2026-08-17T10:45:00Z'),
          durationSeconds: 1100,
        }),
      ],
      [student],
      new Set(),
    );

    expect(result.participants).toEqual([
      expect.objectContaining({
        userId: student.id,
        durationSeconds: 2300,
        occurrences: 2,
        status: 'MISSING',
        firstJoinAt: new Date('2026-08-17T10:00:00Z'),
        lastLeaveAt: new Date('2026-08-17T10:45:00Z'),
      }),
    ]);
  });

  it('uses email as a fallback and marks an existing attendance record as recorded', () => {
    const result = buildReconciliationPreview(
      [row({ name: 'Nimal', userEmail: 'NIMAL@EXAMPLE.COM' })],
      [student],
      new Set([student.id]),
    );

    expect(result.participants[0]?.status).toBe('RECORDED');
  });

  it('does not guess when email and index identify different students', () => {
    const other = { ...student, id: 'student-2', email: 'other@example.com', indexNumber: 99 };
    const result = buildReconciliationPreview(
      [row({ userEmail: other.email })],
      [student, other],
      new Set(),
    );

    expect(result.participants).toEqual([]);
    expect(result.unmatched).toEqual([
      expect.objectContaining({ reason: 'AMBIGUOUS', occurrences: 1 }),
    ]);
  });

  it('ignores a known staff identity instead of treating the host as a student', () => {
    const teacher = { ...student, id: 'teacher-1', role: Role.TEACHER };
    const result = buildReconciliationPreview([row()], [teacher], new Set());

    expect(result.participants).toEqual([]);
    expect(result.unmatched).toEqual([]);
    expect(result.ignored).toBe(1);
  });

  it('flags a known student who is not actively enrolled instead of syncing them', () => {
    const result = buildReconciliationPreview(
      [row()],
      [{ ...student, isEnrolled: false }],
      new Set(),
    );

    expect(result.participants).toEqual([]);
    expect(result.unmatched).toEqual([
      expect.objectContaining({ reason: 'NOT_ENROLLED', occurrences: 1 }),
    ]);
  });
});
