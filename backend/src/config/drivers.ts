/**
 * Provider "drivers" let the whole stack run offline in Docker (see
 * context/documents/16-local-development.md). Every driver defaults to the real
 * provider; the local alternatives are opt-in per environment variable and are
 * refused when NODE_ENV=production.
 */
export const STORAGE_DRIVERS = ['r2', 'local'] as const;
export const SMS_DRIVERS = ['notify', 'log'] as const;

export type StorageDriver = (typeof STORAGE_DRIVERS)[number];
export type SmsDriver = (typeof SMS_DRIVERS)[number];

interface DriverSelection {
  STORAGE_DRIVER: StorageDriver;
  SMS_DRIVER: SmsDriver;
}

/** Returns "VAR=value" for every driver that is a local/mock stand-in rather than the real provider. */
export const findLocalDrivers = (selection: DriverSelection): string[] => {
  const local: string[] = [];
  if (selection.STORAGE_DRIVER !== 'r2') local.push(`STORAGE_DRIVER=${selection.STORAGE_DRIVER}`);
  if (selection.SMS_DRIVER !== 'notify') local.push(`SMS_DRIVER=${selection.SMS_DRIVER}`);
  return local;
};
