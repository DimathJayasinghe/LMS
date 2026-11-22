import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findUnique: vi.fn() }));

import {
  assertOnlineSittingAudience,
  resolveStudentExamAudience,
  studentAudienceSelect,
  toMyAudience,
} from './exam-audience-access.service';

const online = { id: 'aud-1', label: 'Online group', deliveryMode: 'ONLINE' as const, instituteName: null };
const hall = { id: 'aud-2', label: 'Hall A', deliveryMode: 'PHYSICAL' as const, instituteName: 'Nugegoda Centre' };

beforeEach(() => m.findUnique.mockReset());

describe('resolveStudentExamAudience', () => {
  it('looks the participant up by exam and student, never by a client-sent audience', async () => {
    m.findUnique.mockResolvedValue(null);
    await resolveStudentExamAudience({ examParticipant: { findUnique: m.findUnique } } as never, 'exam-1', 'student-1');
    expect(m.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { examId_userId: { examId: 'exam-1', userId: 'student-1' } } }));
  });

  it('reads only the audience label, mode and institute name', async () => {
    m.findUnique.mockResolvedValue(null);
    await resolveStudentExamAudience({ examParticipant: { findUnique: m.findUnique } } as never, 'exam-1', 'student-1');
    expect(m.findUnique.mock.calls[0]![0].select).toEqual({
      audience: { select: { id: true, label: true, deliveryMode: true, institute: { select: { name: true } } } },
    });
  });

  it('returns null when the student has no participant row', async () => {
    m.findUnique.mockResolvedValue(null);
    await expect(resolveStudentExamAudience({ examParticipant: { findUnique: m.findUnique } } as never, 'exam-1', 'student-1')).resolves.toBeNull();
  });

  it('returns the audience with the institute name flattened', async () => {
    m.findUnique.mockResolvedValue({ audience: { id: 'aud-2', label: 'Hall A', deliveryMode: 'PHYSICAL', institute: { name: 'Nugegoda Centre' } } });
    await expect(resolveStudentExamAudience({ examParticipant: { findUnique: m.findUnique } } as never, 'exam-1', 'student-1')).resolves.toEqual(hall);
  });

  it('uses the client it is given, so a transaction sees its own snapshot', async () => {
    const tx = { examParticipant: { findUnique: vi.fn().mockResolvedValue(null) } };
    await resolveStudentExamAudience(tx as never, 'exam-1', 'student-1');
    expect(tx.examParticipant.findUnique).toHaveBeenCalledTimes(1);
    expect(m.findUnique).not.toHaveBeenCalled();
  });
});

describe('assertOnlineSittingAudience', () => {
  it('lets an online participant start with no audience sent', () => {
    expect(() => assertOnlineSittingAudience(online)).not.toThrow();
  });

  it('lets an online participant start when the sent audience matches', () => {
    expect(() => assertOnlineSittingAudience(online, 'aud-1')).not.toThrow();
  });

  it('refuses a student who is not on the list with 403, whatever audience was sent', () => {
    expect(() => assertOnlineSittingAudience(null)).toThrowError(expect.objectContaining({ code: 'EXAM_PARTICIPANT_NOT_FOUND', statusCode: 403 }));
    expect(() => assertOnlineSittingAudience(null, 'aud-1')).toThrowError(expect.objectContaining({ code: 'EXAM_PARTICIPANT_NOT_FOUND', statusCode: 403 }));
  });

  it('tells a hall participant the paper is sat in the hall, with 409', () => {
    expect(() => assertOnlineSittingAudience(hall)).toThrowError(expect.objectContaining({ code: 'EXAM_PHYSICAL_AUDIENCE', statusCode: 409 }));
  });

  it('checks the hall before a mismatching audience, so the hall message wins', () => {
    expect(() => assertOnlineSittingAudience(hall, 'aud-1')).toThrowError(expect.objectContaining({ code: 'EXAM_PHYSICAL_AUDIENCE' }));
  });

  it('refuses a sent audience that is not the participant row with 400', () => {
    expect(() => assertOnlineSittingAudience(online, 'aud-9')).toThrowError(expect.objectContaining({ code: 'EXAM_AUDIENCE_MISMATCH', statusCode: 400 }));
  });
});

describe('what the student is shown', () => {
  it('never exposes the audience id', () => {
    expect(toMyAudience(hall)).toEqual({ label: 'Hall A', deliveryMode: 'PHYSICAL', instituteName: 'Nugegoda Centre' });
    expect(toMyAudience(online)).toEqual({ label: 'Online group', deliveryMode: 'ONLINE', instituteName: null });
  });

  it('selects only the asking student participant row for a list', () => {
    expect(studentAudienceSelect('student-1')).toEqual({
      where: { userId: 'student-1' }, take: 1,
      select: { audience: { select: { id: true, label: true, deliveryMode: true, institute: { select: { name: true } } } } },
    });
  });
});
