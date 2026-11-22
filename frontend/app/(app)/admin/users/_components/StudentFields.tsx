"use client";

import { isMinorBirthDate } from "@/lib/registration";

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** What the registration slip asks for. The guardian block appears for a student under the adult age (the server has the final say). */
export function StudentFields({ birthDate, onBirthDate, showGuardian }: { birthDate: string; onBirthDate: (value: string) => void; showGuardian: boolean }) {
  const guardian = showGuardian || isMinorBirthDate(birthDate);
  return (
    <>
      <label className="block text-sm">Full name
        <input name="name" required minLength={2} maxLength={100} autoComplete="off" className={field} />
      </label>
      <label className="block text-sm">Date of birth
        <input name="dateOfBirth" type="date" required value={birthDate} onChange={(event) => onBirthDate(event.target.value)} className={field} />
      </label>
      <label className="block text-sm">Student&apos;s mobile {guardian ? "(optional)" : ""}
        <input name="phone" type="tel" inputMode="tel" placeholder="0771234567" autoComplete="off" className={field} />
      </label>
      <label className="block text-sm">Email (used to sign in)
        <input name="email" type="email" required maxLength={255} autoComplete="off" className={field} />
      </label>
      {guardian && (
        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Guardian</legend>
          <label className="block text-sm">Guardian&apos;s name
            <input name="guardianName" required minLength={2} maxLength={100} autoComplete="off" className={field} />
          </label>
          <label className="block text-sm">Guardian&apos;s mobile
            <input name="guardianMobile" type="tel" inputMode="tel" required placeholder="0771234567" autoComplete="off" className={field} />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input name="guardianConsent" type="checkbox" required className="mt-1" />
            <span>The guardian agreed to this registration, in person or on a signed form.</span>
          </label>
        </fieldset>
      )}
    </>
  );
}
