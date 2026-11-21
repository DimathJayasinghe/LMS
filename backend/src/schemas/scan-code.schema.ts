import { z } from 'zod';

export const scanCodeSchema = z.string().trim().regex(/^[\x20-\x7E]*$/, 'Code must contain printable ASCII characters only.');
