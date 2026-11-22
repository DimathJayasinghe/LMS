import { describe, expect, it } from 'vitest';
import { registerSchema } from './auth.schema';
import { createStudentSchema } from './student-registration.schema';

const self = { email: 'Kasun@Example.com', password: 'Passw0rd!x', name: 'Kasun Silva', dateOfBirth: '2005-03-04', phone: '077 123 4567' };
const walkIn = { email: 'kasun@example.com', name: 'Kasun Silva', dateOfBirth: '2005-03-04', phone: '0771234567' };
const without = (value: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const issuesOf = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];

describe('registerSchema (self-registration)', () => {
  it('normalises the email and the mobile number', () => {
    const parsed = registerSchema.parse(self);
    expect(parsed.email).toBe('kasun@example.com');
    expect(parsed.phone).toBe('+94771234567');
  });

  it('accepts a guardian mobile instead of the student\'s own', () => {
    const parsed = registerSchema.parse({ ...without(self, 'phone'), guardianName: 'Nimal Silva', guardianMobile: '0712345678', guardianConsent: true });
    expect(parsed.phone).toBeUndefined();
    expect(parsed.guardianMobile).toBe('+94712345678');
  });

  it('refuses a registration with no mobile at all', () => {
    expect(issuesOf(registerSchema.safeParse(without(self, 'phone')))).toEqual(['phone: Enter a mobile number for the student or for a guardian']);
  });

  it('requires a date of birth', () => {
    expect(registerSchema.safeParse(without(self, 'dateOfBirth')).success).toBe(false);
  });

  it.each(['2005-02-30', '05-03-2005', '2005/03/04', 'yesterday', '1899-12-31'])('refuses the date of birth %s', (dateOfBirth) => {
    expect(registerSchema.safeParse({ ...self, dateOfBirth }).success).toBe(false);
  });

  it('refuses a landline or a malformed number', () => {
    expect(registerSchema.safeParse({ ...self, phone: '0112345678' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...self, phone: 'abc' }).success).toBe(false);
  });

  it('accepts no NIC field at all', () => {
    const result = registerSchema.safeParse({ ...self, nic: '200512345678' });
    expect(result.success).toBe(false);
    expect(issuesOf(result)[0]).toContain('nic');
  });

  it('refuses any other unknown field', () => {
    expect(registerSchema.safeParse({ ...self, role: 'SUPER_ADMIN' }).success).toBe(false);
  });

  it('still enforces the password rules', () => {
    expect(registerSchema.safeParse({ ...self, password: 'short' }).success).toBe(false);
  });
});

describe('createStudentSchema (front desk)', () => {
  it('accepts a walk-in with the minimum the slip needs', () => {
    const parsed = createStudentSchema.parse(walkIn);
    expect(parsed.phone).toBe('+94771234567');
  });

  it('stores names with single spaces, so a search with one space finds them', () => {
    const parsed = createStudentSchema.parse({ ...walkIn, name: '  Kasun   Silva ', guardianName: 'Nimal \t Silva', guardianMobile: '0712345678' });
    expect(parsed.name).toBe('Kasun Silva');
    expect(parsed.guardianName).toBe('Nimal Silva');
    expect(registerSchema.parse({ ...self, name: 'Kasun\u00a0 Silva' }).name).toBe('Kasun Silva');
  });

  it('takes a reason for overriding a possible-duplicate warning', () => {
    expect(createStudentSchema.parse({ ...walkIn, duplicateOverrideReason: 'Twin brother, same phone' }).duplicateOverrideReason).toBe('Twin brother, same phone');
    expect(createStudentSchema.safeParse({ ...walkIn, duplicateOverrideReason: 'x' }).success).toBe(false);
  });

  it('needs a mobile for the student or the guardian', () => {
    expect(createStudentSchema.safeParse(without(walkIn, 'phone')).success).toBe(false);
  });

  it('accepts no NIC, no role and no password from the clerk', () => {
    expect(createStudentSchema.safeParse({ ...walkIn, nic: '200512345678' }).success).toBe(false);
    expect(createStudentSchema.safeParse({ ...walkIn, role: 'ADMIN' }).success).toBe(false);
    expect(createStudentSchema.safeParse({ ...walkIn, password: 'Passw0rd!x' }).success).toBe(false);
  });
});
