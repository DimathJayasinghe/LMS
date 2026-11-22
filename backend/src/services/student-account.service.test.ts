import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({ assertScanCodeFree: vi.fn() }));
vi.mock('@/services/scan-code.service', () => ({ assertScanCodeFree: mocks.assertScanCodeFree }));

import { assertRegistrationRules, createStudentAccount, type NewStudent } from './student-account.service';

const rules = { minorAgeYears: 18, today: '2026-11-22' };
const adult = { dateOfBirth: '2000-01-01' };

describe('assertRegistrationRules', () => {
  it('accepts an adult with no guardian', () => {
    expect(() => assertRegistrationRules(adult, rules)).not.toThrow();
  });

  it('refuses a birth date in the future', () => {
    expect(() => assertRegistrationRules({ dateOfBirth: '2026-11-23' }, rules)).toThrow(expect.objectContaining({ code: 'INVALID_DATE_OF_BIRTH', statusCode: 400 }));
  });

  it('treats the day of the 18th birthday as adult and the day before as a minor', () => {
    expect(() => assertRegistrationRules({ dateOfBirth: '2008-11-22' }, rules)).not.toThrow();
    expect(() => assertRegistrationRules({ dateOfBirth: '2008-11-23' }, rules)).toThrow(expect.objectContaining({ code: 'GUARDIAN_REQUIRED' }));
  });

  it('follows the owner-set adult age', () => {
    const fifteen = { dateOfBirth: '2011-01-01' };
    expect(() => assertRegistrationRules(fifteen, { ...rules, minorAgeYears: 15 })).not.toThrow();
    expect(() => assertRegistrationRules(fifteen, { ...rules, minorAgeYears: 16 })).toThrow(expect.objectContaining({ code: 'GUARDIAN_REQUIRED' }));
  });

  it('asks a minor for a guardian name and mobile before the consent', () => {
    const minor = { dateOfBirth: '2012-05-05' };
    expect(() => assertRegistrationRules(minor, rules)).toThrow(expect.objectContaining({ code: 'GUARDIAN_REQUIRED' }));
    expect(() => assertRegistrationRules({ ...minor, guardianName: 'Nimal Silva' }, rules)).toThrow(expect.objectContaining({ code: 'GUARDIAN_REQUIRED' }));
    expect(() => assertRegistrationRules({ ...minor, guardianName: 'Nimal Silva', guardianMobile: '+94712345678' }, rules)).toThrow(expect.objectContaining({ code: 'GUARDIAN_CONSENT_REQUIRED' }));
    expect(() => assertRegistrationRules({ ...minor, guardianName: 'Nimal Silva', guardianMobile: '+94712345678', guardianConsent: true }, rules)).not.toThrow();
  });
});

describe('createStudentAccount', () => {
  const tx = { user: { create: vi.fn(), update: vi.fn() } };
  const student: NewStudent = {
    organizationId: 'org-1', email: 'kasun@example.com', name: 'Kasun Silva', passwordHash: 'hash', phone: '+94771234567',
    dateOfBirth: '2005-03-04', setupCompleted: false, mustChangePassword: false,
  };

  beforeEach(() => {
    tx.user.create.mockReset().mockResolvedValue({ id: 'u1', indexNumber: 12 });
    tx.user.update.mockReset().mockResolvedValue({ id: 'u1', barcode: 'LMS-000012' });
    mocks.assertScanCodeFree.mockReset().mockResolvedValue(undefined);
  });

  it('creates a student, then writes the card derived from the index number', async () => {
    await createStudentAccount(tx as never, student);

    expect(tx.user.create.mock.calls[0]![0].data).toMatchObject({
      organizationId: 'org-1', role: Role.STUDENT, email: 'kasun@example.com', password: 'hash', phone: '+94771234567',
      dateOfBirth: new Date('2005-03-04T00:00:00.000Z'), guardianConsentAt: null, mustChangePassword: false,
    });
    expect(mocks.assertScanCodeFree).toHaveBeenCalledWith(tx, 'LMS-000012', { exceptUserId: 'u1', allowLmsFormat: true });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: { barcode: 'LMS-000012' } }));
  });

  it('records the guardian and the moment of consent', async () => {
    await createStudentAccount(tx as never, { ...student, guardianName: 'Nimal Silva', guardianMobile: '+94712345678', guardianConsent: true });

    const data = tx.user.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ guardianName: 'Nimal Silva', guardianMobile: '+94712345678' });
    expect(data.guardianConsentAt).toBeInstanceOf(Date);
  });

  it('turns a lost race for the address into the duplicate-email answer', async () => {
    tx.user.create.mockRejectedValue({ code: 'P2002' });
    await expect(createStudentAccount(tx as never, student)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
  });

  it('refuses the whole registration when the card is held by someone else', async () => {
    mocks.assertScanCodeFree.mockRejectedValue(Object.assign(new Error('x'), { code: 'CODE_UNAVAILABLE' }));
    await expect(createStudentAccount(tx as never, student)).rejects.toMatchObject({ code: 'CODE_UNAVAILABLE' });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
