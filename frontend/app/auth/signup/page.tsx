"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import AuthAside from "@/components/custom/AuthAside";
import { SignupForm } from "./_components/SignupForm";

export default function SignupPage() {
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

          <SignupForm />

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
