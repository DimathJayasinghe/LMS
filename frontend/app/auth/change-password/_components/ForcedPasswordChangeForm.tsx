"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function ForcedPasswordChangeForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get("newPassword"));
    if (newPassword !== String(data.get("confirmPassword"))) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patch("/users/me/password", { currentPassword: data.get("currentPassword"), newPassword });
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not change your password. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">Temporary password
        <input name="currentPassword" type="password" autoComplete="current-password" required className={`${field} mt-1.5`} />
      </label>
      <label className="block text-sm font-medium">New password
        <input name="newPassword" type="password" autoComplete="new-password" required minLength={8} className={`${field} mt-1.5`} />
      </label>
      <label className="block text-sm font-medium">Confirm new password
        <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className={`${field} mt-1.5`} />
      </label>
      <p className="text-xs text-muted-foreground">At least 8 characters. Other devices will be signed out.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        Save new password
      </Button>
    </form>
  );
}
