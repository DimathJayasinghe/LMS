"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Loader2 } from "lucide-react";

import { PasswordInput } from "@/components/custom/PasswordInput";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { colomboToday, isMinorBirthDate, looksLikeMobile, needsGuardian, registrationBody } from "@/lib/registration";
import type { ApiSuccess, User } from "@/lib/types";
import { signupErrorMessage } from "../signup-error";
import { GuardianSection } from "./GuardianSection";

export type SignupValues = {
  name: string;
  email: string;
  dateOfBirth: string;
  phone: string;
  guardianName: string;
  guardianMobile: string;
  guardianConsent: boolean;
  password: string;
  confirmPassword: string;
};

// Client-side hints; the backend is the final authority (see 04-api-integration §4).
const PATTERNS = {
  name: /^[A-Za-z][A-Za-z\s.'\-]{1,99}$/,
  email: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
  // Matches the backend rule: min 8, upper + lower + number.
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/,
};

export function SignupForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [serverWantsGuardian, setServerWantsGuardian] = useState(false);
  const { register, handleSubmit, setError, control, formState: { errors, isSubmitting } } = useForm<SignupValues>({ mode: "onBlur" });
  const birthDate = useWatch({ control, name: "dateOfBirth" });
  const guardian = serverWantsGuardian || isMinorBirthDate(birthDate ?? "");

  const onSubmit = async (values: SignupValues) => {
    setFormError(null);
    if (!values.phone.trim() && !values.guardianMobile?.trim()) {
      setError("phone", { message: "Enter your mobile number, or a guardian's" });
      return;
    }
    try {
      await api.post<ApiSuccess<User>>("/auth/register", {
        ...registrationBody({ ...values, guardianName: guardian ? values.guardianName ?? "" : "", guardianMobile: guardian ? values.guardianMobile ?? "" : "", guardianConsent: guardian && Boolean(values.guardianConsent) }),
        email: values.email,
        password: values.password,
      });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      if (needsGuardian(err)) setServerWantsGuardian(true);
      if (err instanceof ApiError) {
        err.fields?.forEach((f) => setError(f.field as keyof SignupValues, { message: f.message }));
        setFormError(signupErrorMessage(err));
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <>
      {formError && (
        <div role="alert" className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <Input id="name" className="h-10" autoComplete="name" placeholder="A.K. Dimath Jayasinghe" aria-invalid={!!errors.name}
              {...register("name", { required: "Full name is required", pattern: { value: PATTERNS.name, message: "Letters, spaces, dots, apostrophes and hyphens only (2–100 chars)" } })} />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" className="h-10" autoComplete="email" placeholder="example@gmail.com" aria-invalid={!!errors.email}
              {...register("email", { required: "Email is required", pattern: { value: PATTERNS.email, message: "Enter a valid email address" } })} />
            <FieldError>{errors.email?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="dateOfBirth">Date of birth</FieldLabel>
            <Input id="dateOfBirth" type="date" className="h-10" autoComplete="bday" max={colomboToday()} aria-invalid={!!errors.dateOfBirth}
              {...register("dateOfBirth", { required: "Date of birth is required" })} />
            <FieldError>{errors.dateOfBirth?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Your mobile number{guardian ? " (optional)" : ""}</FieldLabel>
            <Input id="phone" type="tel" inputMode="tel" className="h-10" autoComplete="tel" placeholder="0712345678" aria-invalid={!!errors.phone}
              {...register("phone", { validate: (value) => !value.trim() || looksLikeMobile(value) || "Enter a Sri Lankan mobile number such as 0712345678" })} />
            <FieldError>{errors.phone?.message}</FieldError>
          </Field>
          {guardian && <GuardianSection register={register} errors={errors} />}
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput id="password" className="h-10" autoComplete="new-password" placeholder="Enter your password" aria-invalid={!!errors.password}
              {...register("password", { required: "Password is required", pattern: { value: PATTERNS.password, message: "Min 8 characters with an uppercase, lowercase, and a number" } })} />
            <FieldError>{errors.password?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <PasswordInput id="confirmPassword" className="h-10" autoComplete="new-password" placeholder="Re-enter your password" aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword", { required: "Please confirm your password", validate: (value, formValues) => value === formValues.password || "Passwords do not match" })} />
            <FieldError>{errors.confirmPassword?.message}</FieldError>
          </Field>
        </FieldGroup>
        <button type="submit" disabled={isSubmitting} className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 font-medium text-primary-foreground transition hover:scale-[1.02] disabled:pointer-events-none disabled:opacity-60 motion-reduce:hover:scale-100">
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? "Creating account…" : "Register"}
        </button>
      </form>
    </>
  );
}
