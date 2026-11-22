import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { looksLikeMobile } from "@/lib/registration";
import type { SignupValues } from "./SignupForm";

/** Shown for a student under the adult age: a guardian we can reach, and their agreement. */
export function GuardianSection({ register, errors }: { register: UseFormRegister<SignupValues>; errors: FieldErrors<SignupValues> }) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium">Parent or guardian</legend>
      <Field>
        <FieldLabel htmlFor="guardianName">Guardian&apos;s full name</FieldLabel>
        <Input id="guardianName" className="h-10" autoComplete="off" aria-invalid={!!errors.guardianName}
          {...register("guardianName", { required: "Guardian's name is required for students under 18", minLength: { value: 2, message: "Enter the guardian's full name" } })} />
        <FieldError>{errors.guardianName?.message}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="guardianMobile">Guardian&apos;s mobile number</FieldLabel>
        <Input id="guardianMobile" type="tel" inputMode="tel" className="h-10" autoComplete="off" placeholder="0712345678" aria-invalid={!!errors.guardianMobile}
          {...register("guardianMobile", { required: "Guardian's mobile number is required", validate: (value) => looksLikeMobile(value) || "Enter a Sri Lankan mobile number such as 0712345678" })} />
        <FieldError>{errors.guardianMobile?.message}</FieldError>
      </Field>
      <Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" {...register("guardianConsent", { required: "The guardian must agree" })} />
          <span>My parent or guardian agrees to this registration and may be contacted about my classes.</span>
        </label>
        <FieldError>{errors.guardianConsent?.message}</FieldError>
      </Field>
    </fieldset>
  );
}
