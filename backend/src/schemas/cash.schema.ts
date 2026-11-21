import { z } from 'zod';
import { isRealCalendarDay } from '@/utils/org-time';

const daySchema = z.string().trim().refine(isRealCalendarDay, 'Day must be a real date in YYYY-MM-DD format.');

// Rupees with at most two decimals, so the stored count is exactly what the clerk typed.
const rupeesSchema = z.coerce.number().min(0).max(100_000_000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use at most two decimal places.');

// ─── Cash by day (front desk sees their own, owner sees all) ─────────
export const cashQuerySchema = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
  collectorId: z.string().uuid().optional(),
  instituteId: z.string().uuid().optional(),
});
export type CashQueryInput = z.infer<typeof cashQuerySchema>;

export const cashTallyQuerySchema = cashQuerySchema.extend({
  unreconciled: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});
export type CashTallyQueryInput = z.infer<typeof cashTallyQuerySchema>;

// ─── End-of-day count ───────────────────────────────────────────────
export const closeCashDaySchema = z.object({
  day: daySchema.optional(),
  instituteId: z.string().uuid().nullable().optional(),
  countedAmount: rupeesSchema,
  note: z.string().trim().max(500).optional(),
}).strict();
export type CloseCashDayInput = z.infer<typeof closeCashDaySchema>;

export const cashTallyIdParamSchema = z.object({ id: z.string().uuid() });
