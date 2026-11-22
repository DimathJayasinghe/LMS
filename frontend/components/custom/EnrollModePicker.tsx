"use client";

import { MapPin, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnrollmentMode } from "@/lib/types";

// Physical comes first: the front desk enrols students who are standing at it.
const MODES: { value: EnrollmentMode; label: string; icon: typeof Monitor }[] = [
  { value: "PHYSICAL", label: "Physical", icon: MapPin },
  { value: "ONLINE", label: "Online", icon: Monitor },
];

interface EnrollModePickerProps {
  value: EnrollmentMode;
  onChange: (mode: EnrollmentMode) => void;
  disabled?: boolean;
}

export function EnrollModePicker({ value, onChange, disabled }: EnrollModePickerProps) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mode</p>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map(({ value: mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-pressed={value === mode}
            disabled={disabled}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              value === mode
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
