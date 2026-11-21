"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ArrowLeft, Loader2 } from "lucide-react";

import AuthAside from "@/components/custom/AuthAside";
import { PasswordInput } from "@/components/custom/PasswordInput";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import type { ApiSuccess, User } from "@/lib/types";

type FormValues = {
  name: string;
  email: string;
  phone: string;
  nic: string;
  password: string;
  confirmPassword: string;
};

// Client-side hints; the backend is the final authority (see 04-api-integration §4).
const PATTERNS = {
  name: /^[A-Za-z][A-Za-z\s.'\-]{1,99}$/,
  email: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
  phone: /^(?:\+94|0)[0-9]{9}$/, // Sri Lankan: 0712345678 or +94712345678
  nic: /^(?:\d{9}[VvXx]|\d{12})$/, // Old (9 digits + V/X) or new (12 digits)
  // Matches the backend rule: min 8, upper + lower + number.
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/,
};

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ mode: "onBlur" });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await api.post<ApiSuccess<User>>("/auth/register", {
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone,
        nic: values.nic,
      });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        err.fields?.forEach((f) =>
          setError(f.field as keyof FormValues, { message: f.message }),
        );
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="flex min-h-screen">
      <AuthAside
        tagline="Your journey begins with a single step — sign up and unlock your potential."
        tips={[
          "Pay online and access unlocks automatically once it clears.",
          "Missed a live class? The recording is ready right after.",
          "Attendance is tracked with a quick QR scan at the door.",
          "Exam results land in your account as soon as they're marked.",
        ]}
      />

      <main className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <Link
            href="/home"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">Get started now</h1>
          <p className="mt-2 mb-8 text-muted-foreground">
            Create your account to explore, connect, and grow with ease.
          </p>

          {formError && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Full name</FieldLabel>
                <Input
                  id="name"
                  className="h-10"
                  autoComplete="name"
                  placeholder="A.K. Dimath Jayasinghe"
                  aria-invalid={!!errors.name}
                  {...register("name", {
                    required: "Full name is required",
                    pattern: {
                      value: PATTERNS.name,
                      message:
                        "Letters, spaces, dots, apostrophes and hyphens only (2–100 chars)",
                    },
                  })}
                />
                <FieldError>{errors.name?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  className="h-10"
                  autoComplete="email"
                  placeholder="example@gmail.com"
                  aria-invalid={!!errors.email}
                  {...register("email", {
                    required: "Email is required",
                    pattern: {
                      value: PATTERNS.email,
                      message: "Enter a valid email address",
                    },
                  })}
                />
                <FieldError>{errors.email?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="phone">Phone number</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  className="h-10"
                  autoComplete="tel"
                  placeholder="0712345678"
                  aria-invalid={!!errors.phone}
                  {...register("phone", {
                    required: "Phone number is required",
                    pattern: {
                      value: PATTERNS.phone,
                      message:
                        "Enter a valid Sri Lankan number (e.g. 0712345678 or +94712345678)",
                    },
                  })}
                />
                <FieldError>{errors.phone?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="nic">NIC</FieldLabel>
                <Input
                  id="nic"
                  className="h-10"
                  autoComplete="off"
                  placeholder="200123456789"
                  aria-invalid={!!errors.nic}
                  {...register("nic", {
                    required: "NIC is required",
                    pattern: {
                      value: PATTERNS.nic,
                      message:
                        "Old NIC: 9 digits + V or X (e.g. 901234567V). New NIC: 12 digits",
                    },
                  })}
                />
                <FieldError>{errors.nic?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <PasswordInput
                  id="password"
                  className="h-10"
                  autoComplete="new-password"
                  placeholder="Enter your password"
                  aria-invalid={!!errors.password}
                  {...register("password", {
                    required: "Password is required",
                    pattern: {
                      value: PATTERNS.password,
                      message:
                        "Min 8 characters with an uppercase, lowercase, and a number",
                    },
                  })}
                />
                <FieldError>{errors.password?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword">
                  Confirm password
                </FieldLabel>
                <PasswordInput
                  id="confirmPassword"
                  className="h-10"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  aria-invalid={!!errors.confirmPassword}
                  {...register("confirmPassword", {
                    required: "Please confirm your password",
                    validate: (value, formValues) =>
                      value === formValues.password ||
                      "Passwords do not match",
                  })}
                />
                <FieldError>{errors.confirmPassword?.message}</FieldError>
              </Field>
            </FieldGroup>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 font-medium text-primary-foreground transition hover:scale-[1.02] disabled:pointer-events-none disabled:opacity-60 motion-reduce:hover:scale-100"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? "Creating account…" : "Register"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
