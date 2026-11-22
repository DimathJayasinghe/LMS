const ERROR_MAX_LENGTH = 120;

/** Hides all but the last three digits, so the owner can tell numbers apart without the list becoming a contact sheet. */
export const maskPhone = (phone: string): string => {
  const digits = phone.replace(/[\s-]/g, '');
  const kept = digits.length > 3 ? digits.slice(-3) : '';
  return '*'.repeat(digits.length - kept.length) + kept;
};

/** A provider's failure text, shortened, with any run of seven or more digits (a phone number) hidden. */
export const scrubProviderText = (text: string | null): string | null => {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const hidden = trimmed.replace(/\d{7,}/g, '***');
  return hidden.length > ERROR_MAX_LENGTH ? `${hidden.slice(0, ERROR_MAX_LENGTH - 1)}…` : hidden;
};
