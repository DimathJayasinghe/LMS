# PayHere Onsite (in-app) Checkout — Design

_Date: 2026-07-11 · Branch: `feature/payhere-onsite-checkout` (off `dev`)_

## 1. Goal

Replace the full-page **redirect** to `payhere.lk` with PayHere's **onsite JS checkout**
(`payhere.startPayment`), so paying happens in a **modal on our own page**. Card fields still render
inside PayHere's secure iframe — we never touch card data (no PCI scope). Same server-generated
`merchant_id` + `hash`; no backend change.

**Explicitly out of scope (and rejected):** building our own card-entry form. Collecting raw card
data would put us in PCI-DSS SAQ D scope and PayHere only allows raw-card charging via their
PCI-gated Charging API. Onsite checkout is the compliant "no redirect" answer.

## 2. Mechanism

PayHere onsite checkout:
1. Load `https://www.payhere.lk/lib/payhere.js` (same script for sandbox + live; sandbox is chosen
   by a `sandbox: true` field on the payment object).
2. Wire globals `payhere.onCompleted(orderId)`, `payhere.onDismissed()`, `payhere.onError(msg)`.
3. Call `payhere.startPayment({ ...payload, sandbox })`.

Our backend `POST /payments/initiate` already returns `{ checkoutUrl, payload }` where `payload` has
**every field startPayment needs** (`merchant_id, return_url, cancel_url, notify_url, first_name,
last_name, email, phone, address, city, country, order_id, items, currency, amount, hash, custom_1,
custom_2`). The frontend derives `sandbox = checkoutUrl.includes("sandbox")` — **no backend change**.

## 3. Architecture

```
lib/payhere.ts       add startPayherePayment(init, handlers) — calls window.payhere.startPayment;
                     FALLS BACK to the existing redirectToPayhere() if payhere.js didn't load.
                     Keep redirectToPayhere (now the fallback) + initiatePayherePayment.
components/custom/PayhereScript.tsx   NEW: `next/script` loader for payhere.js (afterInteractive),
                     rendered by the two paying surfaces (dedupes by src).
StudentPayments.tsx  Pay now → initiate → startPayherePayment(...) with modal-lifecycle handlers.
EnrollPanel.tsx      same swap for its pay button.
```

`window.payhere` typing: a minimal `types/payhere.d.ts` (or an inline interface) declaring
`startPayment`, `onCompleted`, `onDismissed`, `onError` — no `any`.

## 4. Flow & state

Pay clicked → `setBusy(true)` → `initiatePayherePayment()` (mints the UUID `Idempotency-Key`) →
`startPayherePayment(res, handlers)` opens the modal. Button stays disabled until a handler fires:

- **`onCompleted(orderId)`** — the user finished PayHere's flow. Real SUCCESS/FAILED is decided
  **server-side by the notify webhook** (PayHere's own docs say not to trust the client), so we show
  "Payment submitted — it'll show as Paid once confirmed" and `router.refresh()`; clear busy.
- **`onDismissed()`** — user closed the popup → clear busy, subtle "Payment cancelled" note.
- **`onError(msg)`** — inline error; clear busy.
- **Fallback** — if `window.payhere` is absent (script blocked/offline), `startPayherePayment`
  calls `redirectToPayhere()` (classic auto-POST) so paying still works.

## 5. Edge cases (incl. the sandbox decline cards)

- **Decline cards** (Insufficient Funds / Limit Exceeded / Do Not Honor / Network Error — see docs)
  and any non-test card → PayHere marks the payment **failed**; the popup surfaces it and the user
  can retry or dismiss. Client can't authoritatively show success/fail (webhook-confirmed) — our
  copy stays truthful ("submitted, confirming"). The four decline scenarios are for **manual**
  verification with the documented cards.
- **Dev without a public `notify_url`** — `onCompleted` fires but the DB stays `PENDING` (webhook
  can't reach localhost). Expected; documented. A tunnel (`ngrok`) is needed for the real flip.
- **Double-click** — button disabled while the modal is open (busy spans the modal lifecycle).
- **Idempotency** — unchanged (`initiatePayherePayment` mints a fresh key; the API-client retry
  replays the same key).
- **`PAYHERE_NOT_CONFIGURED` / 409 already paid** — mapped inline on `initiate`, before the modal.
- **Script load failure** — fallback redirect (above).

## 6. Testing

- **Frontend Vitest+RTL** (`startPayherePayment` + StudentPayments): (a) with a mocked
  `window.payhere`, Pay calls `startPayment` with the payload **and `sandbox: true`**; (b)
  `onDismissed` clears busy + shows the cancelled note; (c) `onError` shows the message; (d) with
  `window.payhere` **undefined**, it falls back to `redirectToPayhere`.
- **System:** `tsc` + `next build` green.
- **Live smoke (headless Chromium on the stack):** as the seeded student, Pay now → the PayHere
  **onsite modal/iframe opens on our page** (no navigation away) → assert the iframe/overlay appears
  and `startPayment` fired. ⚠️ **Entering a card inside PayHere's iframe + the decline scenarios are
  manual** (their hosted popup, sandbox-simulated) — smoke covers "modal opens on our page, no
  redirect"; the card matrix is a documented manual checklist.
- Redeploy the running frontend so the smoke hits the new build.

## 7. Docs

- `context/api_endpoints/payments.endpoints.md` Sandbox section: add the **full test-card set** —
  success (Visa/Master/Amex) + the four decline scenarios (Insufficient Funds, Limit Exceeded, Do
  Not Honor, Network Error) with their card numbers, per support.payhere.lk/sandbox-and-testing; note
  onsite checkout + that any non-listed card fails.
- `context/frontend/06-frontend-roadmap.md`: the Enroll→pay + Payments rows now use onsite checkout.

## 8. Definition of done

- Paying from `/payments` and the class page opens PayHere **in a modal on our page** (redirect only
  as fallback); complete/dismiss/error handled; copy is webhook-honest.
- Full gate green: unit + `tsc`/build + the live smoke (modal-opens), with the manual card matrix
  documented.
- Docs updated (test cards + roadmap).
