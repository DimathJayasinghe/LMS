"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { needsGuardian, readPossibleDuplicates, registrationBody, type PossibleDuplicate } from "@/lib/registration";
import type { ApiSuccess } from "@/lib/types";
import { DuplicateWarning } from "./DuplicateWarning";
import { RegistrationSlip, type RegisteredStudent } from "./RegistrationSlip";
import { StudentFields } from "./StudentFields";

interface Created {
  user: RegisteredStudent;
  temporaryPassword: string;
}

/**
 * Front desk and owner. Registers a walk-in student and shows the slip once: the temporary password lives in this
 * component's state until the dialog closes and is never written to storage or the URL.
 */
export function RegisterStudentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [showGuardian, setShowGuardian] = useState(false);
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[] | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) return;
    if (created) router.refresh();
    setCreated(null); setError(null); setDuplicates(null); setBirthDate(""); setShowGuardian(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    const reason = text("duplicateOverrideReason").trim();
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<ApiSuccess<Created>>(
        "/users/students",
        {
          ...registrationBody({ name: text("name"), dateOfBirth: text("dateOfBirth"), phone: text("phone"), guardianName: text("guardianName"), guardianMobile: text("guardianMobile"), guardianConsent: data.get("guardianConsent") === "on" }),
          email: text("email").trim(),
          ...(reason ? { duplicateOverrideReason: reason } : {}),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setCreated(response.data);
    } catch (cause) {
      const matches = readPossibleDuplicates(cause);
      if (matches) setDuplicates(matches);
      else {
        if (needsGuardian(cause)) setShowGuardian(true);
        setError(cause instanceof ApiError ? cause.message : "Could not register the student. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="outline"><UserPlus className="size-4" aria-hidden />Register student</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-lg">
          <Dialog.Title className="font-semibold">{created ? "Student registered" : "Register a student"}</Dialog.Title>
          {created ? (
            <div className="mt-3 space-y-3">
              <Dialog.Description className="text-sm text-muted-foreground">
                {created.user.name} is #{created.user.indexNumber}. Print the slip and give it to them now: the password is shown only here and they must replace it at their first sign-in.
              </Dialog.Description>
              <p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-wide" data-testid="temporary-password">{created.temporaryPassword}</p>
              <RegistrationSlip student={created.user} temporaryPassword={created.temporaryPassword} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => window.print()}>Print slip</Button>
                <Dialog.Close asChild><Button type="button">Done</Button></Dialog.Close>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-3 space-y-3">
              <Dialog.Description className="text-sm text-muted-foreground">A walk-in gets an index number, a card and a one-time password.</Dialog.Description>
              <StudentFields birthDate={birthDate} onBirthDate={setBirthDate} showGuardian={showGuardian} />
              {duplicates && <DuplicateWarning matches={duplicates} />}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
                <Button type="submit" disabled={busy}>{duplicates ? "Register anyway" : "Register"}</Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
