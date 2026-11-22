import { z } from 'zod';
import { email, requireReachableMobile, studentFields } from './student-registration.schema';

// ─── Register ────────────────────────────────────────────────
// Strict on purpose: there is no NIC field at all, so a client that still sends one is told, not quietly accepted.
export const registerSchema = z
  .strictObject({
    email,
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be under 72 characters') // bcrypt max input length
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    ...studentFields,
  })
  .superRefine(requireReachableMobile);

export type RegisterInput = z.infer<typeof registerSchema>;

// ─── Login ───────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((v) => v.toLowerCase().trim()),

  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
