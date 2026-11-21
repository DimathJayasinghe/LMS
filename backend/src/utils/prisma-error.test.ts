import { expect, it } from 'vitest';
import { hasPrismaCode } from './prisma-error';

it('matches only an error object carrying the requested code', () => {
  expect(hasPrismaCode(Object.assign(new Error('x'), { code: 'P2025' }), 'P2025')).toBe(true);
  expect(hasPrismaCode(Object.assign(new Error('x'), { code: 'P2002' }), 'P2025')).toBe(false);
  expect(hasPrismaCode(new Error('x'), 'P2025')).toBe(false);
  expect(hasPrismaCode(null, 'P2025')).toBe(false);
  expect(hasPrismaCode('P2025', 'P2025')).toBe(false);
});
