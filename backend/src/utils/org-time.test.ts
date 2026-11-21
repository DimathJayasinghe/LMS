import { describe, expect, it } from 'vitest';
import { billingMonthOf, colomboDayOf, dayOfMonthInTz, dayRangeInTz, daysBetween, isRealCalendarDay, monthStartInTz, monthsEndingAt, shiftDay, shiftMonth } from './org-time';

const tz = 'Asia/Colombo';

describe('organization time', () => {
  it('uses the organization month at midnight rather than UTC', () => {
    expect(billingMonthOf(new Date('2026-01-31T18:29:00Z'), tz)).toBe('2026-01');
    expect(billingMonthOf(new Date('2026-01-31T18:31:00Z'), tz)).toBe('2026-02');
    expect(colomboDayOf(new Date('2026-01-31T18:31:00Z'), tz)).toBe('2026-02-01');
    expect(dayOfMonthInTz(new Date('2026-02-28T18:31:00Z'), tz)).toBe(1);
    expect(billingMonthOf(new Date('2026-02-28T18:29:00Z'), tz)).toBe('2026-02');
    expect(billingMonthOf(new Date('2026-02-28T18:31:00Z'), tz)).toBe('2026-03');
  });

  it('returns the UTC bounds of a local day across a month boundary', () => {
    const range = dayRangeInTz('2026-02-28', tz);
    expect(range.start.toISOString()).toBe('2026-02-27T18:30:00.000Z');
    expect(range.end.toISOString()).toBe('2026-02-28T18:30:00.000Z');
  });

  it('shifts a billing month across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-05', 0)).toBe('2026-05');
    expect(shiftMonth('2026-03', -14)).toBe('2025-01');
  });

  it('lists the months ending at a month, oldest first', () => {
    expect(monthsEndingAt('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(monthsEndingAt('2026-02', 1)).toEqual(['2026-02']);
  });

  it('returns the first instant of a billing month in the organization zone', () => {
    expect(monthStartInTz('2026-02', tz).toISOString()).toBe('2026-01-31T18:30:00.000Z');
    expect(monthStartInTz('2026-12', tz).toISOString()).toBe('2026-11-30T18:30:00.000Z');
  });

  it('accepts only real calendar days', () => {
    expect(isRealCalendarDay('2026-02-28')).toBe(true);
    expect(isRealCalendarDay('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-2-3', '26-02-03', '', '2026-02-28T00:00']) expect(isRealCalendarDay(bad)).toBe(false);
    expect(() => dayRangeInTz('2026-02-30', tz)).toThrow(RangeError);
  });

  it('counts and shifts whole days across month and year ends', () => {
    expect(daysBetween('2026-11-20', '2026-11-20')).toBe(0);
    expect(daysBetween('2026-11-20', '2026-12-31')).toBe(41);
    expect(daysBetween('2026-11-20', '2026-11-19')).toBe(-1);
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});
