import { describe, expect, it } from 'vitest';
import { billingMonthOf, colomboDayOf, dayOfMonthInTz, dayRangeInTz } from './org-time';

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
});
