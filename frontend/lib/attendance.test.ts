import { describe, expect, it } from "vitest";
import { attendanceSourceLabel } from "./attendance";
import type { AttendanceSource } from "./types";

describe("attendanceSourceLabel", () => {
  it.each<[AttendanceSource, string]>([
    ["QR", "QR scan"],
    ["BARCODE", "Barcode"],
    ["ZOOM_WEBHOOK", "Online"],
    ["MANUAL", "Manual"],
    ["VIDEO", "Recording"],
  ])("labels %s as %s", (source, label) => {
    expect(attendanceSourceLabel(source)).toBe(label);
  });
});
