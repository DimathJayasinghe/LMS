// Mobile numbers only: 07x xxx xxxx written locally or with the country code. Landlines are not contacts a clerk can SMS.
const MOBILE = /^(?:\+94|0094|94|0)(7\d{8})$/;

/** The number in the one stored form `+947XXXXXXXX`, or null when it is not a Sri Lankan mobile. */
export const normalizeSriLankanMobile = (raw: string): string | null => {
  const match = MOBILE.exec(raw.replace(/[\s\-().]/g, ''));
  return match ? `+94${match[1]}` : null;
};

/** Both spellings a stored number may have (older rows hold the local `07x` form). */
export const mobileVariants = (normalized: string): string[] => [normalized, `0${normalized.slice(3)}`];
