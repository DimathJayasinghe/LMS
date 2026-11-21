import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedOwner, addOwner, resetOwnerPassword, parseOwnerEmail, assertOwnerPassword, readSeedCredentials } from './owner-lib';

const { findFirst, findUnique, create, update, deleteMany, audit, lock, count, setting } = vi.hoisted(() => ({
  findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), audit: vi.fn(), lock: vi.fn(), count: vi.fn(), setting: vi.fn(),
}));
vi.mock('../utils/advisory-lock', () => ({ withAdvisoryLock: lock }));
const tx = { user: { findFirst, findUnique, create, update, count }, refreshToken: { deleteMany }, auditLog: { create: audit }, organizationSetting: { findUnique: setting } };
const db = { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) };
const client = db as unknown as Parameters<typeof seedOwner>[0];
const owner = { id: 'owner', email: 'owner@example.test', role: 'SUPER_ADMIN', deletedAt: null, organizationId: '00000000-0000-4000-8000-000000000001' };
beforeEach(() => { vi.clearAllMocks(); count.mockResolvedValue(1); setting.mockResolvedValue(null); findFirst.mockResolvedValue(null); findUnique.mockResolvedValue(null); create.mockResolvedValue(owner); update.mockResolvedValue(owner); });
describe('owner scripts', () => {
  it('creates an owner when none exists', async () => {
    expect(await seedOwner(client, owner.email, 'password')).toBe('created');
    expect(create).toHaveBeenCalledOnce();
  });
  it('leaves existing owners unchanged even when inactive', async () => {
    findFirst.mockResolvedValue({ ...owner, deletedAt: new Date() });
    expect(await seedOwner(client, owner.email, 'password')).toBe('exists');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('does not promote an existing account', async () => {
    findUnique.mockResolvedValue({ role: 'STUDENT' });
    expect(await seedOwner(client, owner.email, 'password')).toBe('email-taken');
    expect(create).not.toHaveBeenCalled();
  });
  it('adds an owner with a hashed password and audit record', async () => {
    await addOwner(client, owner.email, 'password');
    expect(create.mock.calls[0]![0].data.password).not.toBe('password');
    expect(audit.mock.calls[0]![0].data).toMatchObject({ action: 'OWNER_ADDED', actorId: 'owner', metadata: { via: 'operator-cli' } });
  });
  it('refuses a duplicate email', async () => {
    findUnique.mockResolvedValue(owner);
    await expect(addOwner(client, owner.email, 'password')).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it('refuses to reset a non-owner account', async () => {
    findUnique.mockResolvedValue({ ...owner, role: 'STUDENT' });
    await expect(resetOwnerPassword(client, owner.email, 'password', false)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
  it.each([false, true])('resets password with reactivation=%s and revokes sessions', async (reactivate) => {
    findUnique.mockResolvedValue({ ...owner, deletedAt: new Date() });
    await resetOwnerPassword(client, owner.email, 'password', reactivate);
    expect(update.mock.calls[0]![0].data).toMatchObject(reactivate ? { deletedAt: null } : {});
    if (!reactivate) expect(update.mock.calls[0]![0].data).not.toHaveProperty('deletedAt');
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'owner' } });
    expect(audit.mock.calls[0]![0].data).toMatchObject({ action: 'OWNER_PASSWORD_RESET', metadata: { via: 'operator-cli' } });
    expect(JSON.stringify(audit.mock.calls)).not.toContain('password');
  });
});

describe('owner credential input', () => {
  it('normalises a valid email', () => {
    expect(parseOwnerEmail(' Owner@Example.test ')).toBe('owner@example.test');
  });
  it.each([undefined, '', 'owner', 'owner@', 'a b@example.test'])('rejects the email %s', (value) => {
    expect(() => parseOwnerEmail(value)).toThrow('valid email');
  });
  it.each(['short', 'x'.repeat(73), 'é'.repeat(37)])('rejects an unusable password', (value) => {
    expect(() => assertOwnerPassword(value)).toThrow('Password must be');
  });
  it('accepts a password between 8 characters and 72 bytes', () => {
    expect(() => assertOwnerPassword('x'.repeat(72))).not.toThrow();
  });
  it('requires both seed settings and has no built-in defaults', () => {
    expect(() => readSeedCredentials({})).toThrow('required');
    expect(() => readSeedCredentials({ LMS_ADMIN_EMAIL: 'owner@example.test' })).toThrow('required');
    expect(() => readSeedCredentials({ LMS_ADMIN_PASSWORD: 'long-enough-password' })).toThrow('required');
    expect(readSeedCredentials({ LMS_ADMIN_EMAIL: 'Owner@Example.test', LMS_ADMIN_PASSWORD: 'long-enough-password' })).toEqual({ email: 'owner@example.test', password: 'long-enough-password' });
  });
});

describe('owner cap', () => {
  it('adds an owner while the active owner count is below the default cap of 2', async () => {
    count.mockResolvedValue(1);
    await addOwner(client, owner.email, 'password');
    expect(create).toHaveBeenCalledOnce();
  });
  it('refuses at the default cap and writes nothing', async () => {
    count.mockResolvedValue(2);
    await expect(addOwner(client, owner.email, 'password')).rejects.toThrow(/owner limit/i);
    expect(create).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it('uses the organization setting when it is lowered or raised', async () => {
    setting.mockResolvedValue({ value: 1 });
    count.mockResolvedValue(1);
    await expect(addOwner(client, owner.email, 'password')).rejects.toThrow(/owner limit/i);
    setting.mockResolvedValue({ value: 3 });
    count.mockResolvedValue(2);
    await expect(addOwner(client, owner.email, 'password')).resolves.toBeUndefined();
  });
  it('falls back to the default when the stored value is invalid', async () => {
    setting.mockResolvedValue({ value: 'many' });
    count.mockResolvedValue(2);
    await expect(addOwner(client, owner.email, 'password')).rejects.toThrow(/owner limit/i);
  });
  it('counts only active owners of the organization, after taking the owner lock', async () => {
    await addOwner(client, owner.email, 'password');
    expect(count).toHaveBeenCalledWith({ where: { organizationId: '00000000-0000-4000-8000-000000000001', role: 'SUPER_ADMIN', deletedAt: null } });
    expect(setting).toHaveBeenCalledWith({ where: { organizationId_key: { organizationId: '00000000-0000-4000-8000-000000000001', key: 'identity.maxOwners' } } });
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(count.mock.invocationCallOrder[0]!);
  });
});

describe('operator password reset ends live sessions', () => {
  it('bumps the session version so outstanding access tokens stop on their next request', async () => {
    findUnique.mockResolvedValue(owner);
    await resetOwnerPassword(client, owner.email, 'new-password-1', false);
    expect(update.mock.calls[0]![0].data).toMatchObject({ tokenVersion: { increment: 1 } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'owner' } });
  });
});
