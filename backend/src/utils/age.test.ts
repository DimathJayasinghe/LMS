import { describe, expect, it } from 'vitest';
import { ageOnDay, isMinorOn } from './age';

describe('ageOnDay', () => {
  it('counts a birthday on the day itself', () => {
    expect(ageOnDay('2008-06-15', '2026-06-15')).toBe(18);
    expect(ageOnDay('2008-06-15', '2026-06-14')).toBe(17);
  });

  it('handles the turn of the year', () => {
    expect(ageOnDay('2008-12-31', '2026-12-30')).toBe(17);
    expect(ageOnDay('2008-12-31', '2026-12-31')).toBe(18);
    expect(ageOnDay('2008-01-01', '2026-01-01')).toBe(18);
  });

  it('moves a 29 February birthday to 1 March in a year without one', () => {
    expect(ageOnDay('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOnDay('2008-02-29', '2026-03-01')).toBe(18);
    expect(ageOnDay('2008-02-29', '2028-02-29')).toBe(20);
  });
});

describe('isMinorOn', () => {
  it('is a minor the day before the adult birthday and an adult on it', () => {
    expect(isMinorOn('2008-06-15', '2026-06-14', 18)).toBe(true);
    expect(isMinorOn('2008-06-15', '2026-06-15', 18)).toBe(false);
  });

  it('follows the owner-set adult age', () => {
    expect(isMinorOn('2008-06-15', '2026-06-15', 21)).toBe(true);
    expect(isMinorOn('2008-06-15', '2026-06-15', 16)).toBe(false);
  });
});
