import { prisma } from '@/config/database';
import { AppError } from '@/utils/app-error';

/** The caller's organization and the time zone its billing months and days are counted in. */
export const organizationClockForUser = async (userId: string): Promise<{ organizationId: string; timezone: string }> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true, organization: { select: { timezone: true } } } });
  if (!user?.organizationId || !user.organization) throw new AppError('ORGANIZATION_NOT_FOUND', 404, 'Organization not found.');
  return { organizationId: user.organizationId, timezone: user.organization.timezone };
};
