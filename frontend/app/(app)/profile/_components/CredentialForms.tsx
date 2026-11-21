"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, User } from "@/lib/types";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Shared with the backend's CREDENTIAL_CHANGE_COOLDOWN_MS (7 days). */
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// Fixed locale + timezone so the unlock date renders identically on server and
// client (avoids a hydration mismatch); Asia/Colombo matches the institute.
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Asia/Colombo",
});

/** The date this credential can next be changed, or null if not currently locked. */
function lockedUntil(changedAt?: string | null): Date | null {
  if (!changedAt) return null;
  const until = new Date(changedAt).getTime() + COOLDOWN_MS;
  return Date.now() < until ? new Date(until) : null;
}

function LockNotice({ until }: { until: Date }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden />
      You can change this again on {dateFmt.format(until)}.
    </p>
  );
}

function ChangeEmailForm({ user }: { user: User }) {
  const router = useRouter();
  const lock = lockedUntil(user.emailChangedAt);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch<ApiSuccess<User>>("/users/me/email", {
        currentPassword,
        newEmail: newEmail.trim(),
      });
      setSaved(true);
      setCurrentPassword("");
      setNewEmail("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change your email.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Change email</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Current: <span className="text-foreground">{user.email}</span>
        </p>
      </div>

      {lock ? (
        <LockNotice until={lock} />
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor="email-new" className="text-sm font-medium text-foreground">
              New email
            </label>
            <input
              id="email-new"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              className={field}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="email-current-password" className="text-sm font-medium text-foreground">
              Current password
            </label>
            <input
              id="email-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className={field}
            />
          </div>

          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          {saved && !error && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              Email updated.
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Update email
          </Button>
        </>
      )}
    </form>
  );
}

function ChangePasswordForm({ user }: { user: User }) {
  const router = useRouter();
  const lock = lockedUntil(user.passwordChangedAt);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch<ApiSuccess<null>>("/users/me/password", {
        currentPassword,
        newPassword,
      });
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Change password</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Changing your password signs you out of all other devices.
        </p>
      </div>

      {lock ? (
        <LockNotice until={lock} />
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor="password-current" className="text-sm font-medium text-foreground">
              Current password
            </label>
            <input
              id="password-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className={field}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="password-new" className="text-sm font-medium text-foreground">
                New password
              </label>
              <input
                id="password-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className={field}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password-confirm" className="text-sm font-medium text-foreground">
                Confirm new password
              </label>
              <input
                id="password-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className={field}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>

          {error && (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          {saved && !error && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              Password changed. Other devices were signed out.
            </p>
          )}

          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Update password
          </Button>
        </>
      )}
    </form>
  );
}

export function CredentialForms({ user }: { user: User }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Sign-in &amp; security
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Email and password can each be changed once every 7 days.
        </p>
      </div>
      <ChangeEmailForm user={user} />
      <div className="border-t border-border pt-8">
        <ChangePasswordForm user={user} />
      </div>
    </div>
  );
}
