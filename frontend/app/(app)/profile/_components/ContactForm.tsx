"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, User } from "@/lib/types";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

/** Trim, and treat an emptied field as an explicit clear (null) rather than "". */
function toValue(raw: string): string | null {
  const v = raw.trim();
  return v === "" ? null : v;
}

export function ContactForm({ user }: { user: User }) {
  const router = useRouter();
  const [phone, setPhone] = useState(user.phone ?? "");
  const [address, setAddress] = useState(user.address ?? "");
  const [city, setCity] = useState(user.city ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch<ApiSuccess<User>>("/users/me/profile", {
        phone: toValue(phone),
        address: toValue(address),
        city: toValue(city),
      });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Contact details
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your name and NIC are set at registration and can only be changed by an admin.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Name</label>
          <input value={user.name} readOnly disabled className={`${field} text-muted-foreground`} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">NIC</label>
          <input
            value={user.nic ?? "—"}
            readOnly
            disabled
            className={`${field} text-muted-foreground`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-foreground">
            Phone
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0771234567"
            className={field}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="city" className="text-sm font-medium text-foreground">
            City
          </label>
          <input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Colombo"
            className={field}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="address" className="text-sm font-medium text-foreground">
          Address
        </label>
        <input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="12 Main St"
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
          Details saved.
        </p>
      )}

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        Save changes
      </Button>
    </form>
  );
}
