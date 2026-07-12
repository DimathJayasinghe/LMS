"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { api, ApiError } from "@/lib/api";
import type { NotificationSetting } from "@/lib/types";

interface Props {
  settings: NotificationSetting[];
}

function typeLabel(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function NotificationSettingsTable({ settings: initial }: Props) {
  const [settings, setSettings] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const types = Array.from(new Set(settings.map((s) => s.type)));

  const toggle = async (setting: NotificationSetting): Promise<void> => {
    setBusyId(setting.id);
    setError(null);
    const next = !setting.enabled;

    // Optimistic update, rolled back on failure.
    setSettings((prev) => prev.map((s) => (s.id === setting.id ? { ...s, enabled: next } : s)));

    try {
      await api.patch(`/notification-settings/${setting.id}`, { enabled: next });
    } catch (e) {
      setSettings((prev) => prev.map((s) => (s.id === setting.id ? { ...s, enabled: !next } : s)));
      setError(e instanceof ApiError ? e.message : "Update failed. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border">
      {error && (
        <p className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Scenario</th>
            <th className="px-4 py-3 font-medium">In-app</th>
            <th className="px-4 py-3 font-medium">SMS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {types.map((type) => {
            const inApp = settings.find((s) => s.type === type && s.channel === "IN_APP");
            const sms = settings.find((s) => s.type === type && s.channel === "SMS");

            return (
              <tr key={type} className="bg-card">
                <td className="px-4 py-3 font-medium text-foreground">{typeLabel(type)}</td>
                <td className="px-4 py-3">
                  {inApp && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={inApp.enabled}
                        disabled={busyId === inApp.id}
                        onCheckedChange={() => void toggle(inApp)}
                        aria-label={`${typeLabel(type)} in-app notifications`}
                      />
                      {busyId === inApp.id && (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {sms && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={sms.enabled}
                        disabled={busyId === sms.id}
                        onCheckedChange={() => void toggle(sms)}
                        aria-label={`${typeLabel(type)} SMS notifications`}
                      />
                      {busyId === sms.id && (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
