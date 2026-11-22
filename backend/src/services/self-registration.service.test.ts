import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  prisma: { user: { findUnique: vi.fn(), count: vi.fn() }, organization: { findUnique: vi.fn() }, $transaction: vi.fn() },
  createStudentAccount: vi.fn(),
  withAdvisoryLock: vi.fn(),
}));
vi.mock('@/config/database', () => ({ prisma: mocks.prisma }));
vi.mock('@/services/settings.service', () => ({ createSettingsReader: () => async (key: string) => mocks.settings[key] }));
vi.mock('@/utils/advisory-lock', () => ({ withAdvisoryLock: mocks.withAdvisoryLock }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }));
vi.mock('@/services/student-account.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/student-account.service')>()),
  createStudentAccount: mocks.createStudentAccount,
}));

import { registerSelf } from './self-registration.service';
import type { RegisterInput } from '@/schemas/auth.schema';

const now = new Date('2026-11-22T06:00:00.000Z');
const adult: RegisterInput = { email: 'kasun@example.com', password: 'Passw0rd!x', name: 'Kasun Silva', dateOfBirth: '2005-03-04', phone: '+94771234567' };
const tx = { user: mocks.prisma.user };

beforeEach(() => {
  Object.assign(mocks.settings, {
    'identity.register.selfRegistrationEnabled': true, 'identity.minorAgeYears': 18, 'identity.register.perPhonePerDay': 5,
  });
  mocks.prisma.user.findUnique.mockReset().mockResolvedValue(null);
  mocks.prisma.user.count.mockReset().mockResolvedValue(0);
  mocks.prisma.organization.findUnique.mockReset().mockResolvedValue({ timezone: 'Asia/Colombo' });
  mocks.prisma.$transaction.mockReset().mockImplementation(async (fn: (client: unknown) => unknown) => fn(tx));
  mocks.createStudentAccount.mockReset().mockResolvedValue({ id: 'u1', tokenVersion: 0 });
  mocks.withAdvisoryLock.mockReset().mockResolvedValue(undefined);
});

describe('registerSelf', () => {
  it('creates an unfinished-setup student who is not asked to change the password', async () => {
    await registerSelf(adult, now);

    expect(mocks.createStudentAccount).toHaveBeenCalledWith(tx, expect.objectContaining({
      email: 'kasun@example.com', passwordHash: 'hashed', setupCompleted: false, mustChangePassword: false, organizationId: '00000000-0000-4000-8000-000000000001',
    }));
  });

  it('is closed when the owner switched self-registration off, before anything else is read', async () => {
    mocks.settings['identity.register.selfRegistrationEnabled'] = false;
    await expect(registerSelf(adult, now)).rejects.toMatchObject({ code: 'SELF_REGISTRATION_DISABLED', statusCode: 403 });
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a minor without a guardian before touching the email lookup', async () => {
    await expect(registerSelf({ ...adult, dateOfBirth: '2012-05-05' }, now)).rejects.toMatchObject({ code: 'GUARDIAN_REQUIRED' });
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('judges the age on the Colombo day, not the UTC day', async () => {
    const lateEvening = new Date('2026-11-21T20:00:00.000Z'); // already 22 November in Colombo
    await expect(registerSelf({ ...adult, dateOfBirth: '2008-11-22' }, lateEvening)).resolves.toBeDefined();
  });

  it('refuses an address that is taken', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'other' });
    await expect(registerSelf(adult, now)).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', statusCode: 409 });
  });

  it('lets siblings share a number up to the daily cap and refuses the next account', async () => {
    mocks.prisma.user.count.mockResolvedValue(4);
    await expect(registerSelf(adult, now)).resolves.toBeDefined();

    mocks.prisma.user.count.mockResolvedValue(5);
    await expect(registerSelf(adult, now)).rejects.toMatchObject({ code: 'REGISTRATION_LIMIT_REACHED', statusCode: 429 });
    expect(mocks.createStudentAccount).toHaveBeenCalledTimes(1);
  });

  it('counts the last 24 hours of students holding the number in either spelling, as their own or a guardian\'s', async () => {
    await registerSelf(adult, now);

    expect(mocks.prisma.user.count.mock.calls[0]![0].where).toMatchObject({
      role: 'STUDENT',
      createdAt: { gte: new Date('2026-11-21T06:00:00.000Z') },
      OR: [{ phone: { in: ['+94771234567', '0771234567'] } }, { guardianMobile: { in: ['+94771234567', '0771234567'] } }],
    });
  });

  it('caps the guardian number too, taking the locks in a fixed order', async () => {
    await registerSelf({ ...adult, guardianName: 'Nimal Silva', guardianMobile: '+94712345678', guardianConsent: true }, now);

    expect(mocks.withAdvisoryLock.mock.calls.map((call) => call[3])).toEqual(['+94712345678', '+94771234567']);
  });

  it('checks the cap once when the student gives their own number as the guardian\'s', async () => {
    await registerSelf({ ...adult, guardianName: 'Kasun Silva', guardianMobile: '+94771234567', guardianConsent: true }, now);
    expect(mocks.prisma.user.count).toHaveBeenCalledTimes(1);
  });
});
