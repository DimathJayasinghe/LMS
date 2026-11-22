"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";

export interface RegisteredStudent {
  id: string;
  indexNumber: number;
  name: string;
  email: string;
  barcode: string | null;
}

/**
 * The slip handed to the student: who they are, their card, how to sign in and the one-time password. It lives in a
 * portal on the page body so the print stylesheet can show only this (`body[data-print-slip]`, see globals.css), and the
 * password stays in this component's props: not in storage, not in the URL.
 */
export function RegistrationSlip({ student, temporaryPassword }: { student: RegisteredStudent; temporaryPassword: string }) {
  useEffect(() => {
    document.body.dataset.printSlip = "true";
    return () => { delete document.body.dataset.printSlip; };
  }, []);

  return createPortal(
    <div className="print-slip-root p-8 font-sans text-black">
      <h1 className="text-2xl font-bold">Registration slip</h1>
      <p className="mt-1 text-sm">{new Date().toLocaleDateString("en-LK", { dateStyle: "long" })}</p>
      <div className="mt-6 flex items-start justify-between gap-8">
        <dl className="space-y-3 text-lg">
          <div><dt className="text-sm text-gray-600">Student</dt><dd className="font-semibold">{student.name}</dd></div>
          <div><dt className="text-sm text-gray-600">Index number</dt><dd className="font-semibold">#{student.indexNumber}</dd></div>
          <div><dt className="text-sm text-gray-600">Sign in with</dt><dd className="font-semibold">{student.email}</dd></div>
          <div><dt className="text-sm text-gray-600">Temporary password</dt><dd className="font-mono text-2xl font-semibold tracking-wide">{temporaryPassword}</dd></div>
        </dl>
        {student.barcode && (
          <div className="text-center">
            <QRCodeSVG value={student.barcode} size={140} />
            <p className="mt-2 font-mono text-sm">{student.barcode}</p>
          </div>
        )}
      </div>
      <p className="mt-8 text-sm">Choose a new password the first time you sign in, then keep this slip safe or tear it up. Show the card code at the door to mark your attendance.</p>
    </div>,
    document.body,
  );
}
