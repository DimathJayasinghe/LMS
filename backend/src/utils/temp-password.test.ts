import { describe, expect, it } from 'vitest';
import { TEMP_PASSWORD_ALPHABET, generateTemporaryPassword } from './temp-password';

describe('temporary password', () => {
  it('leaves out characters that are easy to misread', () => {
    for (const ambiguous of ['0', 'O', '1', 'l', 'I']) expect(TEMP_PASSWORD_ALPHABET).not.toContain(ambiguous);
    expect(new Set(TEMP_PASSWORD_ALPHABET).size).toBe(TEMP_PASSWORD_ALPHABET.length);
  });

  it.each([8, 10, 72])('has exactly the requested length (%i)', (length) => {
    expect(generateTemporaryPassword(length)).toHaveLength(length);
  });

  it('only uses the alphabet and differs between calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const value = generateTemporaryPassword(12);
      expect([...value].every((char) => TEMP_PASSWORD_ALPHABET.includes(char))).toBe(true);
      seen.add(value);
    }
    expect(seen.size).toBe(50);
  });

  it('refuses a length that cannot be stored as a password', () => {
    expect(() => generateTemporaryPassword(7)).toThrow();
    expect(() => generateTemporaryPassword(73)).toThrow();
    expect(() => generateTemporaryPassword(10.5)).toThrow();
  });
});
