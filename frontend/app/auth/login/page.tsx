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
  email: string;
  password: string;
};

export default function LoginPage() {
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
      await api.post<ApiSuccess<User>>("/auth/login", values);
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
        tagline="Welcome back — pick up right where you left off."
        tips={[
          "Catch up on any class you missed, right from your dashboard.",
          "Check this month's payment status without leaving your dashboard.",
          "Live classes open right in the browser — no separate app needed.",
          "Your results and attendance are always one click away.",
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
          <h1 className="text-4xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 mb-8 text-muted-foreground">
            Sign in to continue to your classes.
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
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="h-10"
                  placeholder="example@gmail.com"
                  aria-invalid={!!errors.email}
                  {...register("email", { required: "Email is required" })}
                />
                <FieldError>{errors.email?.message}</FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  className="h-10"
                  placeholder="Enter your password"
                  aria-invalid={!!errors.password}
                  {...register("password", { required: "Password is required" })}
                />
                <FieldError>{errors.password?.message}</FieldError>
              </Field>
            </FieldGroup>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 font-medium text-primary-foreground transition hover:scale-[1.02] disabled:pointer-events-none disabled:opacity-60 motion-reduce:hover:scale-100"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link
              href="/auth/signup"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
