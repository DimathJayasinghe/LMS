import { describe, expect, it } from 'vitest';
import { createStaffSchema } from './user.schema';

const valid = { name: 'Nimal Perera', email: 'Nimal@Example.com', role: 'TEACHER' };

describe('createStaffSchema', () => {
  it('accepts a teacher, front desk and marker, and lowercases the email', () => {
    for (const role of ['TEACHER', 'ADMIN', 'MARKER']) {
      expect(createStaffSchema.parse({ ...valid, role }).role).toBe(role);
    }
    expect(createStaffSchema.parse(valid).email).toBe('nimal@example.com');
  });

  it.each(['SUPER_ADMIN', 'STUDENT', 'PLATFORM_ADMIN', 'teacher', ''])('refuses the role %j', (role) => {
    expect(createStaffSchema.safeParse({ ...valid, role }).success).toBe(false);
  });

  it.each([
    ['a missing name', { ...valid, name: undefined }],
    ['a one-letter name', { ...valid, name: 'N' }],
    ['a bad email', { ...valid, email: 'not-an-email' }],
    ['a bad phone', { ...valid, phone: '12345' }],
    ['an over-long password for the step-up', { ...valid, currentPassword: 'x'.repeat(73) }],
    ['an empty step-up password', { ...valid, currentPassword: '' }],
  ])('refuses %s', (_label, body) => {
    expect(createStaffSchema.safeParse(body).success).toBe(false);
  });

  it('accepts a Sri Lankan phone in either format, and none', () => {
    expect(createStaffSchema.safeParse({ ...valid, phone: '0771234567' }).success).toBe(true);
    expect(createStaffSchema.safeParse({ ...valid, phone: '+94771234567' }).success).toBe(true);
    expect(createStaffSchema.safeParse(valid).success).toBe(true);
  });

  it('keeps unknown fields out of the parsed result', () => {
    const parsed = createStaffSchema.parse({ ...valid, isAdmin: true, mustChangePassword: false, password: 'chosen-by-caller' });
    expect(parsed).not.toHaveProperty('isAdmin');
    expect(parsed).not.toHaveProperty('mustChangePassword');
    expect(parsed).not.toHaveProperty('password');
  });
});
