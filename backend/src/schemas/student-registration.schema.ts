import { z } from 'zod';
import { isRealCalendarDay } from '@/utils/org-time';
import { normalizeSriLankanMobile } from '@/utils/sri-lanka-mobile';

const mobile = (label: string) =>
  z.string().trim().transform((value, ctx) => {
    const normalized = normalizeSriLankanMobile(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: `${label} must be a Sri Lankan mobile number such as 077 123 4567` });
      return z.NEVER;
    }
    return normalized;
  });

// Shape only: "not in the future" and "is a minor" need the organization's clock and settings, so the service decides.
const dateOfBirth = z
  .string()
  .refine(isRealCalendarDay, 'Enter a real date of birth as YYYY-MM-DD')
  .refine((day) => day >= '1900-01-01', 'Enter a real date of birth');

export const email = z
  .string()
  .email('Invalid email address')
  .max(255, 'Email must be under 255 characters')
  .transform((value) => value.toLowerCase().trim());

/** The fields the registration slip captures, shared by self-registration and the front desk. No NIC: it is never asked for here. */
export const studentFields = {
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be under 100 characters').trim(),
  dateOfBirth,
  phone: mobile('Mobile number').optional(),
  guardianName: z.string().trim().min(2, 'Guardian name must be at least 2 characters').max(100, 'Guardian name must be under 100 characters').optional(),
  guardianMobile: mobile('Guardian mobile number').optional(),
  guardianConsent: z.boolean().optional(),
  address: z.string().trim().max(500, 'Address must be under 500 characters').optional(),
  city: z.string().trim().max(100, 'City must be under 100 characters').optional(),
};

/** A student with no mobile of their own needs a guardian's: somebody must be reachable. */
export const requireReachableMobile = (value: { phone?: string; guardianMobile?: string }, ctx: z.RefinementCtx): void => {
  if (!value.phone && !value.guardianMobile) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a mobile number for the student or for a guardian' });
  }
};

/** Walk-in registration by the front desk: the clerk can override a possible-duplicate warning with a reason. */
export const createStudentSchema = z
  .strictObject({
    email,
    ...studentFields,
    duplicateOverrideReason: z.string().trim().min(3, 'Give a reason of at least 3 characters').max(300).optional(),
  })
  .superRefine(requireReachableMobile);

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
