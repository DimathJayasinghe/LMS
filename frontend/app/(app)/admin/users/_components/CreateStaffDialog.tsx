"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, Role } from "@/lib/types";

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const STAFF_ROLES: { value: Extract<Role, "TEACHER" | "ADMIN" | "MARKER">; label: string }[] = [
  { value: "TEACHER", label: "Teacher" },
  { value: "ADMIN", label: "Front desk" },
  { value: "MARKER", label: "Marker" },
];

interface Created {
  user: { id: string; name: string; email: string; role: Role };
  temporaryPassword: string;
}

/**
 * Owner-only. Creates a staff account with a one-time password that is shown once, here, and dropped from state when
 * the dialog closes; it is never written to storage or the URL.
 */
export function CreateStaffDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // The list behind the dialog now includes the new account.
      if (created) router.refresh();
      setCreated(null);
      setError(null);
      setCopied(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const phone = String(data.get("phone") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<ApiSuccess<Created>>(
        "/users/staff",
        {
          name: String(data.get("name") ?? "").trim(),
          email: String(data.get("email") ?? "").trim(),
          ...(phone ? { phone } : {}),
          role: data.get("role"),
          currentPassword: data.get("currentPassword"),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setCreated(response.data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not create the account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(created?.temporaryPassword ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button>
          <UserPlus className="size-4" aria-hidden />
          Add staff
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-lg">
          <Dialog.Title className="font-semibold">{created ? "Account created" : "Add a staff account"}</Dialog.Title>
          {created ? (
            <div className="mt-3 space-y-3">
              <Dialog.Description className="text-sm text-muted-foreground">
                Give this temporary password to {created.user.name} ({created.user.email}) in person. It is shown only now. They
                must choose a new password the first time they sign in.
              </Dialog.Description>
              <p className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-wide" data-testid="temporary-password">
                {created.temporaryPassword}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
                <Dialog.Close asChild><Button type="button">Done</Button></Dialog.Close>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-3 space-y-3">
              <Dialog.Description className="text-sm text-muted-foreground">
                Creates a teacher, front-desk or marker account. For a new owner, ask your operator.
              </Dialog.Description>
              <label className="block text-sm">Full name
                <input name="name" required minLength={2} maxLength={100} autoComplete="off" className={field} />
              </label>
              <label className="block text-sm">Email
                <input name="email" type="email" required maxLength={255} autoComplete="off" className={field} />
              </label>
              <label className="block text-sm">Phone (optional)
                <input name="phone" type="tel" inputMode="tel" placeholder="0771234567" autoComplete="off" className={field} />
              </label>
              <label className="block text-sm">Role
                <select name="role" required defaultValue="" className={field}>
                  <option value="" disabled>Select a role</option>
                  {STAFF_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </label>
              <label className="block text-sm">Your password
                <input name="currentPassword" type="password" autoComplete="current-password" required className={field} />
              </label>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
                <Button type="submit" disabled={busy}>Create account</Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
