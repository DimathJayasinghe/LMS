import { z } from 'zod';
export const updateSettingSchema = z.object({ value: z.unknown() }).strict().refine((body) => Object.hasOwn(body, 'value'));
