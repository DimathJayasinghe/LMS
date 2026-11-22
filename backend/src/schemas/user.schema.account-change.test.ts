import { describe, expect, it } from 'vitest';
import { handoverOrphanedSchema, updateRoleSchema, updateStatusSchema } from './user.schema';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

describe('updateRoleSchema', () => {
  it.each(['ADMIN', 'TEACHER', 'MARKER'])('accepts %s with a reason', (role) => {
    expect(updateRoleSchema.safeParse({ role, reason: 'Moved to the front desk' }).success).toBe(true);
  });

  it.each(['SUPER_ADMIN', 'STUDENT', 'ROOT', ''])('refuses %s: owners are added by an operator and students are never promoted', (role) => {
    expect(updateRoleSchema.safeParse({ role }).success).toBe(false);
  });

  it('trims the reason and keeps it short', () => {
    expect(updateRoleSchema.parse({ role: 'TEACHER', reason: '  Covering maths  ' }).reason).toBe('Covering maths');
    expect(updateRoleSchema.safeParse({ role: 'TEACHER', reason: 'x'.repeat(301) }).success).toBe(false);
    expect(updateRoleSchema.safeParse({ role: 'TEACHER', reason: '  ' }).success).toBe(false);
  });
});

describe('updateStatusSchema', () => {
  it('needs only isActive', () => {
    expect(updateStatusSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateStatusSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a hand-over to one teacher or one per class', () => {
    expect(updateStatusSchema.safeParse({ isActive: false, handoverAllTo: ID_A }).success).toBe(true);
    expect(updateStatusSchema.safeParse({ isActive: false, handover: [{ courseId: ID_A, toTeacherId: ID_B }], effectiveMonth: 'CURRENT' }).success).toBe(true);
  });

  it('refuses a class named twice, a non-id and an unknown month', () => {
    expect(updateStatusSchema.safeParse({ isActive: false, handover: [{ courseId: ID_A, toTeacherId: ID_B }, { courseId: ID_A, toTeacherId: ID_A }] }).success).toBe(false);
    expect(updateStatusSchema.safeParse({ isActive: false, handoverAllTo: 'a teacher' }).success).toBe(false);
    expect(updateStatusSchema.safeParse({ isActive: false, effectiveMonth: 'LATER' }).success).toBe(false);
  });
});

describe('handoverOrphanedSchema', () => {
  it('needs somebody to take the classes', () => {
    expect(handoverOrphanedSchema.safeParse({}).success).toBe(false);
    expect(handoverOrphanedSchema.safeParse({ handover: [] }).success).toBe(false);
    expect(handoverOrphanedSchema.safeParse({ handoverAllTo: ID_A }).success).toBe(true);
    expect(handoverOrphanedSchema.safeParse({ handover: [{ courseId: ID_A, toTeacherId: ID_B }] }).success).toBe(true);
  });
});
