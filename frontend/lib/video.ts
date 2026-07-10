/** Video display helpers. */

/** Format a duration in seconds as "H:MM:SS" or "M:SS". Returns null if unknown. */
export function formatDuration(seconds?: number | null): string | null {
  if (seconds == null || seconds <= 0 || !Number.isFinite(seconds)) return null;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
