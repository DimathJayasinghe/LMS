"use client";

import Script from "next/script";

/**
 * Loads PayHere's onsite-checkout SDK (`payhere.js`). Rendered by the paying
 * surfaces (payments page, EnrollPanel); `next/script` dedupes by `src`, so
 * mounting it in more than one place loads the script once. Same URL for
 * sandbox and live — the environment is chosen per-payment via the `sandbox`
 * flag in `startPayherePayment`.
 */
export function PayhereScript() {
  return <Script src="https://www.payhere.lk/lib/payhere.js" strategy="afterInteractive" />;
}
