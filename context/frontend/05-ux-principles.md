# 05 — UX Principles

> Non-negotiable rules for building screens. These are enforced in review — a screen that ignores them is not
> done. They implement the "accessible, responsive, clear" philosophy from the design language (Doc 01).

---

## 1. Accessibility (WCAG 2.1 AA minimum)

- **Keyboard:** every interactive element is reachable and operable by keyboard (Tab/Shift-Tab/Enter/Space/Esc).
  No mouse-only actions. Modals trap focus and close on `Esc`; focus returns to the trigger on close.
- **Focus visible:** never remove focus rings. shadcn primitives ship `focus-visible:ring-ring` — keep it. Custom
  interactive elements must add an equivalent.
- **Semantics:** use the right element — `<button>` for actions, `<a>`/`<Link>` for navigation, `<nav>`, `<main>`,
  `<header>`, `<footer>`, `<ul>/<li>` for lists, one `<h1>` per page then a logical heading order. Don't wrap a
  whole page's content in a single `<h1>` (the current hero does this — fix when touched).
- **Labels:** every input has an associated `<label>` (shadcn `Field`/`FieldLabel` handles this). Icon-only
  buttons need `aria-label`. Decorative icons get `aria-hidden`.
- **Images:** meaningful `alt` on content images; `alt=""` for purely decorative ones (e.g. the grid backdrop).
- **Contrast:** body text meets AA (4.5:1); large text 3:1. The black-on-white base passes easily — watch faint
  overlays (the landing's low-opacity italic quote and `text-muted-foreground` on tinted backgrounds).
- **Announcements:** toasts and async results use a polite live region so screen readers hear them.

## 2. Motion & `prefers-reduced-motion`

- Honor `prefers-reduced-motion: reduce` **everywhere**. When set: disable the animated grid, typing/text
  animations, hover scale, rainbow loop, and any auto-playing motion; keep instant state changes.
- Implement via Tailwind's `motion-reduce:` variants (e.g. `motion-reduce:transform-none
  motion-reduce:transition-none`) or a `useReducedMotion()` guard from `motion` for JS-driven animation.
- No animation blocks interaction or exceeds ~500ms for functional transitions (decorative loops excepted, and
  they must be低-contrast and pausable-by-preference).

## 3. Responsiveness (mobile matters — no native app)

- Design works at **375px (mobile), 768px (tablet), 1280px (desktop)**. Test all three.
- Marketing: single-column stacking on mobile; the pill nav collapses to a hamburger/sheet under `lg`.
- Dashboard shell: sidebar collapses to a hamburger/drawer under `lg`; consider a bottom nav bar with the 3–4 key
  actions on mobile.
- Use fluid layout (flex/grid, `max-w-*`, `gap-*`), relative units, and `object-cover` images. **No horizontal
  page scroll** at any width — wide tables scroll inside their own `overflow-x-auto` container.
- Tap targets ≥ 44×44px on touch. Don't rely on hover for essential info on mobile.

## 4. Every screen ships four states

For any data-driven view, implement all four — not just the happy path:

1. **Loading** — a meaningful skeleton that mirrors the final layout (use `loading.tsx` / `<Suspense>` +
   `Skeleton`). Never a bare "Loading…".
2. **Empty** — a friendly `EmptyState` (icon + one line + a primary action, e.g. "No classes yet → Browse classes").
   Distinct from loading and from error.
3. **Error** — a recoverable message from `ApiError.message` with a retry (`error.tsx` `reset()`, or an inline
   retry). Map known `code`s to helpful copy (`PAYMENT_REQUIRED` → pay CTA; `NOT_ENROLLED` → enroll CTA).
4. **Success/content** — the actual UI.

## 5. Forms

- Use **react-hook-form** (already the pattern on auth pages) with **`mode: 'onBlur'`** validation.
- Validate on the client for instant feedback, **and** map backend validation errors (`data: field[]`, Doc 04 §4)
  onto fields with `setError` — the server is the final authority.
- Show the error message directly under the field, in `text-destructive text-xs`, tied via `aria-describedby`.
  Mark invalid fields with `aria-invalid` (shadcn inputs already style this).
- Disable the submit button while submitting and show a spinner; never allow double-submit. Keep the button width stable.
- Preserve entered values on error. Use correct `type`/`inputMode`/`autoComplete` (`email`, `tel`, `nic` numeric,
  password managers friendly). Reuse the Sri Lankan `phone`/`nic` patterns already defined on the auth pages.
- Destructive actions require a confirm step (shadcn `AlertDialog`), never a bare button.

## 6. Feedback & latency

- Acknowledge every action within ~100ms (optimistic UI, spinner, or disabled state). Success → toast
  (shadcn `sonner`) or inline confirmation; failure → clear error, state preserved.
- Long/blocking operations (PDF upload, video token, exam submit) show explicit progress and cannot be
  double-triggered. Uploads show percentage where the API supports it.
- Navigation uses `<Link>` prefetch so transitions feel instant; pair with `loading.tsx` for perceived speed.

## 7. Consistency & the token discipline

- Style with **design tokens** (Doc 01), never raw colors. Concretely: prefer `bg-background`, `text-foreground`,
  `bg-card`, `text-muted-foreground`, `border-border` over `bg-white`, `text-black`, `text-gray-*`. This keeps
  light/dark correct and the look coherent.
  - *Cleanup backlog (existing landing uses raw colors):* `bg-white`/`text-black`/`bg-gray-50`/`text-gray-*` in
    `home/page.tsx`, `CourseCard.tsx`, `StudentReviews.tsx`, `Nav.tsx`, and the `#` placeholder links. Migrate to
    tokens + `<Link>` when you next touch each file.
- One primary action per view; one `RainbowButton` per view at most (Doc 01 §5).
- Same status → same badge everywhere (Doc 01 §7). Same spacing rhythm and radii across similar components.

## 8. Content & locale

- Currency is **LKR**; format with `Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' })`.
- Times are **Asia/Colombo**. The API stores UTC; render in Colombo local (the timetable is authored in Colombo
  time). Show clear day/time labels (e.g. "Mon · 3:00–5:00 PM").
- Dates: format with `Intl.DateTimeFormat('en-LK', …)`; never show raw ISO strings to users.
- Keep copy plain and encouraging (the brand voice: "Discover your path…"). Avoid jargon; write for students and
  front-desk staff, not engineers.

## 9. Privacy & safety in the UI

- Never render tokens/secrets; session is cookie-based (Doc 04). Don't log PII (NIC, phone) to the console.
- Video/exam content is access-gated server-side; the UI should **guide** (enroll/pay prompts) rather than expose
  content optimistically before the gate passes.
- Respect the content-protection intent: don't add "download" affordances to protected streams; the stream token
  is IP-bound and short-lived by design.
