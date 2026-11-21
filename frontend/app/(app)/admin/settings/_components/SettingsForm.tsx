"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";

export interface Setting { key: string; value: unknown; default: unknown }
const labelOf = (key: string): string => (key.split(".").slice(1).join(" · ")).replace(/([a-z])([A-Z])/g, "$1 $2");

function SettingField({ setting }: { setting: Setting }) {
  const [value, setValue] = useState(Array.isArray(setting.value) ? setting.value.join(", ") : setting.value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const label = labelOf(setting.key);
  const fixed = setting.key === "exams.marking.markerMayOverrideTeacher";
  const save = async (): Promise<void> => {
    setBusy(true); setMessage("");
    try {
      const nextValue = Array.isArray(setting.default) && typeof value === "string"
        ? value.split(",").map((part) => part.trim()).filter(Boolean) : value;
      await api.patch(`/settings/${encodeURIComponent(setting.key)}`, { value: nextValue });
      setMessage("Saved.");
    } catch (error) { setMessage(error instanceof ApiError ? error.message : "Could not save. Try again."); }
    finally { setBusy(false); }
  };
  const controlClass = "w-full min-w-0 rounded-md border border-border bg-background px-3 py-2";
  return <div className="grid gap-2 border-t border-border py-4 sm:grid-cols-[1fr_12rem_auto] sm:items-center">
    <label htmlFor={setting.key} className="text-sm font-medium break-words">{label}</label>
    {typeof setting.default === "boolean" ? <select id={setting.key} className={controlClass} value={String(value)} disabled={fixed || busy} onChange={(event) => setValue(event.target.value === "true")}><option value="true">On</option><option value="false">Off</option></select>
      : typeof setting.default === "number" ? <input id={setting.key} className={controlClass} type="number" value={typeof value === "number" ? value : ""} disabled={busy} onChange={(event) => setValue(event.target.value === "" ? null : Number(event.target.value))} />
      : Array.isArray(setting.default) ? <input id={setting.key} className={controlClass} value={typeof value === "string" ? value : ""} disabled={busy} onChange={(event) => setValue(event.target.value)} />
      : <select id={setting.key} className={controlClass} value={String(value)} disabled={busy} onChange={(event) => setValue(event.target.value)}><option value="WARN">Warn</option><option value="BLOCK">Block</option></select>}
    <button type="button" className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={busy || fixed} aria-label={`Save ${label}`} onClick={() => void save()}>Save</button>
    {fixed && <p className="text-xs text-muted-foreground">Fixed policy</p>}
    {message && <p role="status" className="text-sm sm:col-span-3">{message}</p>}
  </div>;
}

export function SettingsForm({ settings }: { settings: Setting[] }) {
  if (!settings.length) return <p>No settings available.</p>;
  const groups = [...new Set(settings.map((setting) => setting.key.split(".")[0]))];
  return <div className="space-y-6">{groups.map((group) => <section key={group} className="min-w-0 rounded-xl border border-border p-4"><h2 className="pb-2 text-lg font-semibold capitalize">{group}</h2>{settings.filter((setting) => setting.key.startsWith(`${group}.`)).map((setting) => <SettingField key={setting.key} setting={setting} />)}</section>)}</div>;
}
