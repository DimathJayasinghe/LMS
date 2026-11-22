import { describe, expect, it } from 'vitest';
import { mobileVariants, normalizeSriLankanMobile } from './sri-lanka-mobile';

describe('normalizeSriLankanMobile', () => {
  it.each([
    ['0771234567', '+94771234567'],
    ['077 123 4567', '+94771234567'],
    ['077-123-4567', '+94771234567'],
    ['+94771234567', '+94771234567'],
    ['+94 77 123 4567', '+94771234567'],
    ['94771234567', '+94771234567'],
    ['0094771234567', '+94771234567'],
    ['(077) 1234567', '+94771234567'],
  ])('writes %s as %s', (raw, expected) => {
    expect(normalizeSriLankanMobile(raw)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['771234567', 'no leading zero or country code'],
    ['0112345678', 'a landline'],
    ['07712345', 'too short'],
    ['07712345678', 'too long'],
    ['+95771234567', 'another country'],
    ['07a1234567', 'letters'],
    ['+940771234567', 'country code followed by the zero'],
  ])('refuses %s (%s)', (raw) => {
    expect(normalizeSriLankanMobile(raw)).toBeNull();
  });

  it('lists the stored and the local spelling for matching older rows', () => {
    expect(mobileVariants('+94771234567')).toEqual(['+94771234567', '0771234567']);
  });
});
