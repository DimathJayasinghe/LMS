/**
 * PayHere checkout helpers, shared by the class-detail EnrollPanel and the
 * student payments page. PayHere expects an auto-submitted POST form (not a
 * plain redirect), and the API bills by calendar month in "YYYY-MM" form.
 */

import { api } from "./api";
import type { ApiSuccess } from "./types";

/** Current billing month in the API's "YYYY-MM" format. */
export function currentPaymentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** PayHere checkout initiation returned by POST /payments/initiate. */
export interface PayhereInitiation {
  checkoutUrl: string;
  payload: Record<string, string>;
  payment: { id: string; amount: string; status: string; paymentMonth: string };
}

/**
 * Initiate a PayHere checkout for one enrollment + month. `/payments/initiate`
 * is a high-stakes POST and the backend requires a valid-UUID `Idempotency-Key`
 * header (repo invariant), so we mint one per attempt here — both the payments
 * page and EnrollPanel go through this to avoid re-introducing that gap.
 */
export function initiatePayherePayment(enrollmentId: string, paymentMonth: string) {
  return api.post<ApiSuccess<PayhereInitiation>>(
    "/payments/initiate",
    { enrollmentId, paymentMonth },
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
}

/** Build and auto-submit the hidden POST form PayHere's checkout requires. */
export function redirectToPayhere(url: string, fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
