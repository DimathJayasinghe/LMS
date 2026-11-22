/** "HH:mm" as minutes after midnight. */
export const minutesFromMidnight = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
};

/** True when two same-day ranges share any minute; back-to-back ranges do not overlap. */
export const timeRangesOverlap = (aStart: string, aMinutes: number, bStart: string, bMinutes: number): boolean => {
  const a = minutesFromMidnight(aStart);
  const b = minutesFromMidnight(bStart);
  return a < b + bMinutes && b < a + aMinutes;
};
