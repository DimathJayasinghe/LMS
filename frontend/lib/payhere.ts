/**
 * PayHere checkout helpers, shared by the class-detail EnrollPanel and the
 * student payments page. PayHere expects an auto-submitted POST form (not a
 * plain redirect), and the API bills by calendar month in "YYYY-MM" form.
 */

import { api } from "./api";
import type { ApiSuccess } from "./types";

/** Current billing month in the API's "YYYY-MM" format. */
export function currentPaymentMonth(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
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

// ── Onsite (in-app) checkout — payhere.js SDK ────────────────────────────────

/** The subset of the global `payhere` object (from payhere.js) we use. */
interface PayhereSdk {
  startPayment: (payment: Record<string, string | boolean | undefined>) => void;
  onCompleted?: (orderId: string) => void;
  onDismissed?: () => void;
  onError?: (error: string) => void;
}

declare global {
  interface Window {
    payhere?: PayhereSdk;
  }
}

export interface PayhereHandlers {
  /** Fired when the popup flow finishes. NOT authoritative — the notify webhook confirms. */
  onCompleted?: (orderId: string) => void;
  /** Fired when the user closes the popup without finishing. */
  onDismissed?: () => void;
  /** Fired on a checkout error. */
  onError?: (error: string) => void;
}

/**
 * Open PayHere's **onsite** checkout (a modal on our own page) for a payment
 * already initiated server-side. The card fields render inside PayHere's secure
 * iframe, so we never touch card data. Falls back to the classic full-page
 * redirect if `payhere.js` hasn't loaded (script blocked/offline).
 */
export function startPayherePayment(
  init: Pick<PayhereInitiation, "checkoutUrl" | "payload">,
  handlers: PayhereHandlers = {},
): void {
  const ph = typeof window !== "undefined" ? window.payhere : undefined;
  if (!ph || typeof ph.startPayment !== "function") {
    redirectToPayhere(init.checkoutUrl, init.payload);
    return;
  }
  ph.onCompleted = handlers.onCompleted;
  ph.onDismissed = handlers.onDismissed;
  ph.onError = handlers.onError;
  // `sandbox` selects PayHere's test environment; derive it from the checkout host.
  ph.startPayment({ ...init.payload, sandbox: init.checkoutUrl.includes("sandbox") });
}
