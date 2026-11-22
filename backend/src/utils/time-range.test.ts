import { describe, expect, it } from 'vitest';
import { minutesFromMidnight, timeRangesOverlap } from './time-range';

describe('time ranges', () => {
  it('reads HH:mm as minutes after midnight', () => {
    expect(minutesFromMidnight('00:00')).toBe(0);
    expect(minutesFromMidnight('16:30')).toBe(990);
  });

  it.each([
    ['same start', '16:00', 60, '16:00', 30, true],
    ['one starts inside the other', '16:00', 60, '16:59', 60, true],
    ['one contains the other', '16:00', 120, '16:30', 30, true],
    ['back to back', '16:00', 60, '17:00', 60, false],
    ['the other side, back to back', '17:00', 60, '16:00', 60, false],
    ['far apart', '08:00', 60, '16:00', 60, false],
  ])('%s', (_name, aStart, aMinutes, bStart, bMinutes, expected) => {
    expect(timeRangesOverlap(aStart, aMinutes, bStart, bMinutes)).toBe(expected);
  });
});
