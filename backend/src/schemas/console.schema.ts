import { z } from 'zod';
import { isRealCalendarDay } from '@/utils/org-time';
import { PAYMENT_MONTH_REGEX } from '@/utils/constants';

export const consoleCashQuerySchema = z.object({
  date: z.string().trim().refine(isRealCalendarDay, 'Date must be a real day in YYYY-MM-DD format.').optional(),
});
export type ConsoleCashQuery = z.infer<typeof consoleCashQuerySchema>;

export const consoleOwingQuerySchema = z.object({
  month: z.string().trim().regex(PAYMENT_MONTH_REGEX, 'Month must be in YYYY-MM format.').optional(),
});
export type ConsoleOwingQuery = z.infer<typeof consoleOwingQuerySchema>;
