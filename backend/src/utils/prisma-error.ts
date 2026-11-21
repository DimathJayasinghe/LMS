/** True when `error` carries the given Prisma error code (for example `P2002` unique violation, `P2025` no matching row). */
export const hasPrismaCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code;
