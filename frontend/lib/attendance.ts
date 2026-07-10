import type { AttendanceSource } from "./types";

/** Human label for an attendance source (badge text). */
export function attendanceSourceLabel(source: AttendanceSource): string {
  switch (source) {
    case "QR":
      return "QR scan";
    case "BARCODE":
      return "Barcode";
    case "ZOOM_WEBHOOK":
      return "Online";
    case "MANUAL":
      return "Manual";
    default:
      return source;
  }
}
