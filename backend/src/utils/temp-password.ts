import { randomInt } from 'node:crypto';

/** Letters and digits without `0 O 1 l I`, which are hard to tell apart when read out or copied by hand. */
export const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const MIN_LENGTH = 8;
const MAX_LENGTH = 72; // bcrypt ignores everything past 72 bytes

/** A one-time password from the system CSPRNG (`randomInt` is unbiased). Shown once to staff and never stored in clear. */
export const generateTemporaryPassword = (length: number): string => {
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new RangeError(`Temporary password length must be an integer from ${MIN_LENGTH} to ${MAX_LENGTH}.`);
  }
  let value = '';
  for (let i = 0; i < length; i += 1) value += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
  return value;
};
