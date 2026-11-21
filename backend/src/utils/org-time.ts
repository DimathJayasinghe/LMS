const partsInTz = (date: Date, tz: string): Record<string, string> =>
  Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));

export const colomboDayOf = (date: Date, tz: string): string => {
  const p = partsInTz(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
};
export const billingMonthOf = (date: Date, tz: string): string => colomboDayOf(date, tz).slice(0, 7);
export const dayOfMonthInTz = (date: Date, tz: string): number => Number(partsInTz(date, tz).day);

const midnightInTz = (year: number, month: number, day: number, tz: string): Date => {
  const local = Date.UTC(year, month - 1, day);
  let guess = local;
  for (let i = 0; i < 4; i++) {
    const p = partsInTz(new Date(guess), tz);
    const observed = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    const next = guess + local - observed;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
};

/** The billing month `delta` months away from `month` (`YYYY-MM`). */
export const shiftMonth = (month: string, delta: number): string => {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
};

/** The `count` billing months ending at (and including) `month`, oldest first. */
export const monthsEndingAt = (month: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => shiftMonth(month, i - count + 1));

/** True for a real calendar date written as YYYY-MM-DD (so 2026-02-30 is not). */
export const isRealCalendarDay = (day: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10) === day;
};

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The calendar day `delta` days away from `day` (`YYYY-MM-DD`). */
export const shiftDay = (day: string, delta: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/** Start inclusive, end exclusive, in UTC. */
export const dayRangeInTz = (day: string, tz: string): { start: Date; end: Date } => {
  if (!isRealCalendarDay(day)) throw new RangeError('Invalid calendar day');
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return { start: midnightInTz(year, month, date, tz), end: midnightInTz(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz) };
};

/** The first instant of a billing month in the organization's zone, in UTC. */
export const monthStartInTz = (month: string, tz: string): Date => dayRangeInTz(`${month}-01`, tz).start;
