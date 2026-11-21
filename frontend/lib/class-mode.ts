/** A session or timetable slot mode. `null` means in hall plus a live stream (D-STRUCTURE-7). */
export type ClassMode = "PHYSICAL" | "ONLINE" | null;

export function classModeLabel(mode: ClassMode): string {
  if (mode === "PHYSICAL") return "In hall";
  if (mode === "ONLINE") return "Online only";
  return "In hall + live stream";
}

/** Every mode except hall only can host a live class. */
export function canGoLive(mode: ClassMode): boolean {
  return mode !== "PHYSICAL";
}
