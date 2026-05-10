import { z } from 'zod';

// ─── Register ────────────────────────────────────────────────
export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be under 255 characters')
    .transform((v) => v.toLowerCase().trim()),

  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be under 100 characters')
    .trim(),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be under 72 characters') // bcrypt max input length
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),

  phone: z
    .string()
    .regex(/^(?:\+94|0)[0-9]{9}$/, 'Invalid Sri Lankan phone number')
    .optional(),

  nic: z
    .string()
    .regex(
      /^(?:[0-9]{9}[VvXx]|[0-9]{12})$/,
      'Invalid NIC format. Use old (9 digits + V/X) or new (12 digits)',
    )
    .optional(),
});

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
