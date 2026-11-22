import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  prisma: { user: { findUnique: vi.fn() }, $transaction: vi.fn() },
  createStudentAccount: vi.fn(),
  findPossibleDuplicates: vi.fn(),
  logInTransaction: vi.fn(),
}));
vi.mock('@/config/database', () => ({ prisma: mocks.prisma }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async (value: string) => `hash:${value}`) } }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => mocks.settings[key] }));
vi.mock('@/services/organization-clock.service', () => ({ organizationClockForUser: async () => ({ organizationId: 'org-1', timezone: 'Asia/Colombo' }) }));
vi.mock('@/services/audit.service', () => ({ logInTransaction: mocks.logInTransaction }));
vi.mock('@/services/student-duplicates.service', () => ({ findPossibleDuplicates: mocks.findPossibleDuplicates }));
vi.mock('@/services/student-account.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/student-account.service')>()),
  createStudentAccount: mocks.createStudentAccount,
}));

import { createStudentAsStaff } from './student-registration.service';

const now = new Date('2026-11-22T06:00:00.000Z');
const desk = { userId: 'desk-1', role: Role.ADMIN } as never;
const context = { ipAddress: '127.0.0.1' } as never;
const walkIn = { email: 'kasun@example.com', name: 'Kasun Silva', dateOfBirth: '2005-03-04', phone: '+94771234567' } as never;
const tx = {};

beforeEach(() => {
  Object.assign(mocks.settings, { 'identity.minorAgeYears': 18, 'identity.tempPassword.length': 10, 'identity.register.duplicateWarning': true });
  mocks.prisma.user.findUnique.mockReset().mockResolvedValue(null);
  mocks.prisma.$transaction.mockReset().mockImplementation(async (fn: (client: unknown) => unknown) => fn(tx));
  mocks.createStudentAccount.mockReset().mockResolvedValue({ id: 'u1', indexNumber: 12, barcode: 'LMS-000012' });
  mocks.findPossibleDuplicates.mockReset().mockResolvedValue([]);
  mocks.logInTransaction.mockReset().mockResolvedValue(undefined);
});

describe('createStudentAsStaff', () => {
  it('registers a walk-in with a one-time password the student must replace, and finished setup', async () => {
    const result = await createStudentAsStaff(walkIn, desk, context, now);

    expect(result.temporaryPassword).toHaveLength(10);
    expect(mocks.createStudentAccount).toHaveBeenCalledWith(tx, expect.objectContaining({
      organizationId: 'org-1', passwordHash: `hash:${result.temporaryPassword}`, mustChangePassword: true, setupCompleted: true,
    }));
    expect(result.user).toMatchObject({ id: 'u1', barcode: 'LMS-000012' });
  });

  it.each([Role.TEACHER, Role.MARKER, Role.STUDENT])('refuses %s', async (role) => {
    await expect(createStudentAsStaff(walkIn, { userId: 'x', role } as never, context, now)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(mocks.createStudentAccount).not.toHaveBeenCalled();
  });

  it('lets the owner register a student too', async () => {
    await expect(createStudentAsStaff(walkIn, { userId: 'owner-1', role: Role.SUPER_ADMIN } as never, context, now)).resolves.toBeDefined();
  });

  it('writes one audit row with no secret in it', async () => {
    const { temporaryPassword } = await createStudentAsStaff(walkIn, desk, context, now);

    expect(mocks.logInTransaction).toHaveBeenCalledTimes(1);
    const row = mocks.logInTransaction.mock.calls[0]![1];
    expect(row).toMatchObject({ action: 'STUDENT_REGISTERED_BY_STAFF', targetType: 'User', targetId: 'u1', organizationId: 'org-1' });
    expect(JSON.stringify(row)).not.toContain(temporaryPassword);
  });

  it('refuses a minor without a guardian and records the front desk as the consent source when there is one', async () => {
    const minor = { ...(walkIn as object), dateOfBirth: '2012-05-05' } as never;
    await expect(createStudentAsStaff(minor, desk, context, now)).rejects.toMatchObject({ code: 'GUARDIAN_REQUIRED' });

    const withGuardian = { ...(minor as object), guardianName: 'Nimal Silva', guardianMobile: '+94712345678', guardianConsent: true } as never;
    await createStudentAsStaff(withGuardian, desk, context, now);
    expect(mocks.logInTransaction.mock.calls[0]![1].metadata).toMatchObject({ guardianConsentSource: 'FRONT_DESK' });
  });

  describe('possible duplicates', () => {
    const match = { id: 'old', name: 'Kasun Silva', indexNumber: 7 };

    it('stops the clerk once with who it might be', async () => {
      mocks.findPossibleDuplicates.mockResolvedValue([match]);

      await expect(createStudentAsStaff(walkIn, desk, context, now)).rejects.toMatchObject({
        code: 'POSSIBLE_DUPLICATE', statusCode: 409, details: { matches: [match] },
      });
      expect(mocks.createStudentAccount).not.toHaveBeenCalled();
    });

    it('goes ahead with a reason and records the reason and the index numbers it passed over', async () => {
      mocks.findPossibleDuplicates.mockResolvedValue([match]);

      await createStudentAsStaff({ ...(walkIn as object), duplicateOverrideReason: 'Twin, same phone' } as never, desk, context, now);

      expect(mocks.logInTransaction.mock.calls[0]![1].metadata).toMatchObject({ duplicateOverride: { reason: 'Twin, same phone', matchedIndexNumbers: [7] } });
    });

    it('does not look when the owner turned the warning off', async () => {
      mocks.settings['identity.register.duplicateWarning'] = false;
      await createStudentAsStaff(walkIn, desk, context, now);
      expect(mocks.findPossibleDuplicates).not.toHaveBeenCalled();
    });

    it('searches by the student\'s own and the guardian\'s number and by name', async () => {
      await createStudentAsStaff({ ...(walkIn as object), guardianMobile: '+94712345678' } as never, desk, context, now);
      expect(mocks.findPossibleDuplicates).toHaveBeenCalledWith(mocks.prisma, 'org-1', { name: 'Kasun Silva', numbers: ['+94771234567', '+94712345678'] });
    });
  });

  it('refuses an address that is taken, after the duplicate warning and before creating anything', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'other' });
    await expect(createStudentAsStaff(walkIn, desk, context, now)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
    expect(mocks.createStudentAccount).not.toHaveBeenCalled();
  });

  it('refuses a future date of birth on the Colombo day', async () => {
    await expect(createStudentAsStaff({ ...(walkIn as object), dateOfBirth: '2026-11-23' } as never, desk, context, now)).rejects.toMatchObject({ code: 'INVALID_DATE_OF_BIRTH' });
  });
});
