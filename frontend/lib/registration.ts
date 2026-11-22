import { ApiError } from "@/lib/api";

/** The adult age the backend uses unless the owner changed `identity.minorAgeYears`; the server decides, this only shows the guardian block early. */
export const DEFAULT_ADULT_AGE = 18;

/** Today in Sri Lanka as `YYYY-MM-DD`, whatever the browser's own zone. */
export function colomboToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole years from a birth date to a day, both `YYYY-MM-DD`. */
export function ageOn(birthDate: string, day: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number) as [number, number, number];
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return year - birthYear - (month > birthMonth || (month === birthMonth && date >= birthDay) ? 0 : 1);
}

/** True for a complete, real birth date that makes the person younger than the adult age today. */
export function isMinorBirthDate(birthDate: string, today: string = colomboToday(), adultAge: number = DEFAULT_ADULT_AGE): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && birthDate <= today && ageOn(birthDate, today) < adultAge;
}

/** Sri Lankan mobile in any common spelling (`07x`, `+947x`, with spaces or dashes). The server normalises it. */
export function looksLikeMobile(value: string): boolean {
  return /^(?:\+94|0094|94|0)7\d{8}$/.test(value.replace(/[\s\-().]/g, ""));
}

export interface RegistrationValues {
  name: string;
  dateOfBirth: string;
  phone: string;
  guardianName: string;
  guardianMobile: string;
  guardianConsent: boolean;
}

/** Only what was filled in, trimmed: the API rejects empty strings for the optional mobile fields. */
export function registrationBody(values: RegistrationValues): Record<string, string | boolean> {
  const body: Record<string, string | boolean> = { name: values.name.trim(), dateOfBirth: values.dateOfBirth };
  const phone = values.phone.trim();
  const guardianName = values.guardianName.trim();
  const guardianMobile = values.guardianMobile.trim();
  if (phone) body.phone = phone;
  if (guardianName) body.guardianName = guardianName;
  if (guardianMobile) body.guardianMobile = guardianMobile;
  if (values.guardianConsent) body.guardianConsent = true;
  return body;
}

export interface PossibleDuplicate {
  id: string;
  name: string;
  indexNumber: number;
}

/** The students a front-desk registration stopped on, or null when the failure is anything else. */
export function readPossibleDuplicates(cause: unknown): PossibleDuplicate[] | null {
  if (!(cause instanceof ApiError) || cause.code !== "POSSIBLE_DUPLICATE") return null;
  const matches = (cause.details as { matches?: PossibleDuplicate[] } | undefined)?.matches;
  return Array.isArray(matches) && matches.length > 0 ? matches : null;
}

/** The server errors that mean "this student needs a guardian", so the form can show that block even if its own check was off. */
export function needsGuardian(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.code === "GUARDIAN_REQUIRED" || cause.code === "GUARDIAN_CONSENT_REQUIRED");
}
