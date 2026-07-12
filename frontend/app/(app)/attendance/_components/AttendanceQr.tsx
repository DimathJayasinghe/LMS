"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * The student's check-in code, rendered as a QR of their barcode value. Staff
 * scan it at the entrance (`POST /attendance/scan { barcode }`). Kept on a solid
 * white plate in both themes — QR contrast must stay dark-on-light to scan.
 */
export function AttendanceQr({ value }: { value: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <QRCodeSVG value={value} size={200} level="M" marginSize={0} />
      </div>
      <p className="font-mono text-sm tracking-widest text-foreground">{value}</p>
    </div>
  );
}
