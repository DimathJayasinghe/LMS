"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { resetNeedsActorPassword } from "@/lib/password-reset";
import type { ApiSuccess, User } from "@/lib/types";

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const IDENTITY_CHECKS = [
  { value: "IN_PERSON_CARD", label: "Checked in person with their ID or student card" },
  { value: "GUARDIAN_PHONE", label: "Confirmed by calling the guardian's phone on file" },
  { value: "OWNER_KNOWS", label: "The owner knows this person" },
] as const;

/**
 * Staff-assisted reset. The temporary password is shown once, here, and is dropped from state when the dialog closes;
 * it is never written to storage or the URL.
 */
export function ResetPasswordDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const needsActorPassword = resetNeedsActorPassword(user);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTemporaryPassword(null);
      setError(null);
      setCopied(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<ApiSuccess<{ temporaryPassword: string }>>(
        `/users/${user.id}/reset-password`,
        {
          identityCheck: data.get("identityCheck"),
          ...(needsActorPassword ? { currentPassword: data.get("currentPassword") } : {}),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setTemporaryPassword(response.data.temporaryPassword);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not reset the password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Reset password for ${user.name}`}>Reset password</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-lg">
          <Dialog.Title className="font-semibold">Reset password for {user.name}</Dialog.Title>
          {temporaryPassword ? (
            <div className="mt-3 space-y-3">
              <Dialog.Description className="text-sm text-muted-foreground">
                Give this temporary password to {user.name} in person. It is shown only now. They must choose a new password the next time they sign in, and every device they were signed in on is signed out.
              </Dialog.Description>
              <p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-wide" data-testid="temporary-password">{temporaryPassword}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
                <Dialog.Close asChild><Button type="button">Done</Button></Dialog.Close>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-3 space-y-3">
              <Dialog.Description className="text-sm text-muted-foreground">
                This signs {user.name} out everywhere and sets a one-time password. Confirm who they are first.
              </Dialog.Description>
              <label className="block text-sm">How did you confirm who they are?
                <select name="identityCheck" required defaultValue="" className={field}>
                  <option value="" disabled>Select one</option>
                  {IDENTITY_CHECKS.map((check) => <option key={check.value} value={check.value}>{check.label}</option>)}
                </select>
              </label>
              {needsActorPassword && (
                <label className="block text-sm">Your password
                  <input name="currentPassword" type="password" autoComplete="current-password" required className={field} />
                </label>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
                <Button type="submit" disabled={busy}>Reset password</Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
