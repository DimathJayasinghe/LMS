import { Role } from '@prisma/client';
import { AppError } from '@/utils/app-error';
import type { AuthenticatedUser } from '@/types/auth.types';

/** The console is the owner's alone; checked in each panel's service as well as at the route. */
export const assertOwner = (actor: AuthenticatedUser): void => {
  if (actor.role !== Role.SUPER_ADMIN) throw new AppError('FORBIDDEN', 403, 'Only the owner can open the console.');
};
