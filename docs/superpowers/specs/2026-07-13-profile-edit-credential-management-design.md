# Profile Edit + Credential Management — Design

**Date:** 2026-07-13
**Branch:** `feature/profile-edit-credentials`
**Status:** Approved (design)

## Goal

Give every authenticated user a self-service **profile page** where they can:

1. Upload / replace / remove a **profile image** shown site-wide.
2. Edit their **contact details** (phone, address, city).
3. Change their **email** and **password**, each rate-limited to once per ~7 days,
   with the current password required.

Identity fields (`nic`, `name`) stay read-only for the user — only an admin changes
them via existing admin endpoints.

## Decisions (locked with the user)

- **Editable fields:** contact only (`phone`, `address`, `city`) + avatar. `nic` and
  `name` are read-only for self-service.
- **Credential guard:** changing email or password requires re-entering the current
  password.
- **Avatar storage:** public R2/CDN URL (a stable, publicly reachable URL), *not* the
  private presigned-GET model used for NIC photos — the avatar renders on nearly every
  page, so a stable public URL avoids per-render presigning.
- **Password change** revokes all refresh tokens and reissues a fresh cookie pair for
  the current session (other devices get logged out).
- **Same-value changes** (`SAME_EMAIL` / `SAME_PASSWORD`) are rejected and do **not**
  consume the weekly window.

## Existing code this builds on

- `User` model already has `nic`, `phone`, `address`, `city`, `nicFrontUrl`,
  `nicBackUrl`. No `profileImage` yet.
- No self-service profile-update, change-email, or change-password endpoints exist —
  all new.
- R2 presign→confirm upload pattern (shipped 2026-07-13) and a Redis-backed rate
  limiter are available to reuse.
- No email-sending infra (SMS only, via Notify.lk) — so email change is a **direct
  change guarded by the current password**, not an email-verification link.
- `TopBar` renders `Avatar` with initials only; `AvatarImage` exists but is unused —
  that is the site-wide hook.

## 1. Data model (Prisma)

Add to `User`:

- `profileImage String?` — the **public CDN URL** of the avatar (a full URL, not an R2
  key; contrast with `nicFrontUrl` which stores a private key).
- `emailChangedAt DateTime?` — cooldown anchor for email changes.
- `passwordChangedAt DateTime?` — cooldown anchor for password changes.

DB columns (not Redis TTL keys) so the once-per-week limit survives a Redis flush and
stays auditable. One migration; all nullable, no backfill.

## 2. Public avatar storage (new R2 path)

The existing `lms` bucket is **private** (NIC photos, exam PDFs); every helper in
`utils/r2.ts` binds to `env.R2_BUCKET_NAME`. Public avatars therefore need a **separate
public bucket**.

- New env (validated in `config/env.ts`): `R2_PUBLIC_BUCKET_NAME`,
  `R2_PUBLIC_BASE_URL` (the bucket's `r2.dev` / custom-domain base URL). Both optional;
  if unset, avatar endpoints return `503 R2_NOT_CONFIGURED` (same shape as today).
- `utils/r2.ts`: parameterize the existing helpers by bucket (default stays the private
  one) so a presigned PUT + HeadObject can target the public bucket without duplicating
  client setup. Add `createR2PublicPresignedPutUrl` and a public-bucket HeadObject path.
- **Dashboard step (one-time, done by the operator):** create the public bucket, enable
  public access, add its CORS rule for the app origin — mirrors the private-bucket CORS
  fix. This is infra config, not code (the app's S3 key cannot set `PutBucketCors`).

## 3. Backend endpoints — all self-scoped (`/me`, `userId` from token, every role)

| Method | Path | Body | Notes |
|---|---|---|---|
| `PATCH` | `/api/users/me/profile` | `{ phone?, address?, city? }` | Contact fields only. `nic`, `name`, `email`, `role` never accepted here. |
| `POST` | `/api/users/me/avatar/upload-url` | `{ fileName, contentType, fileSizeBytes }` | Presign PUT to the public bucket, key `avatars/<userId>/<uuid>.<ext>`. Persists nothing. `image/jpeg`, `image/png`, `image/webp`; ≤ 5 MB. |
| `POST` | `/api/users/me/avatar/confirm` | `{ key }` | Prefix-guard `avatars/<callerId>/` → `403 FORBIDDEN_KEY`; HeadObject → `409 UPLOAD_NOT_FOUND` if missing; then persist `profileImage = <R2_PUBLIC_BASE_URL>/<key>`. Idempotent. |
| `DELETE` | `/api/users/me/avatar` | — | Set `profileImage = null` (best-effort object delete; ignore delete failure). |
| `PATCH` | `/api/users/me/email` | `{ currentPassword, newEmail }` | Verify password **first** (`401 INVALID_CREDENTIALS`), then cooldown (`429 EMAIL_CHANGE_TOO_SOON`), then same-value (`400 SAME_EMAIL`), then uniqueness (`409 EMAIL_ALREADY_EXISTS`), then update + set `emailChangedAt`. |
| `PATCH` | `/api/users/me/password` | `{ currentPassword, newPassword }` | Verify password → cooldown (`429 PASSWORD_CHANGE_TOO_SOON`) → same-value (`400 SAME_PASSWORD`) → hash + update + `passwordChangedAt`; revoke all refresh tokens and reissue a fresh cookie pair for the current session. |

**Check-ordering rationale:** current-password verification runs before the cooldown
check so a caller who fails auth gets `401` and never learns the cooldown state.

**Cooldown window:** 7 days, from a shared constant (`CREDENTIAL_CHANGE_COOLDOWN_MS`).
The `429` responses include `nextAllowedAt` (ISO timestamp) so the UI can show when the
next change is allowed. `emailChangedAt` / `passwordChangedAt` are independent counters.

New error codes: `EMAIL_CHANGE_TOO_SOON`, `PASSWORD_CHANGE_TOO_SOON` (429);
`SAME_EMAIL`, `SAME_PASSWORD` (400).

## 4. Service layer

New `profile.service.ts` (keeps `user.service.ts` focused on admin-on-user ops; it is
the only layer importing `prisma` for these routes). Credential ops reuse `bcrypt` plus
two **newly-exported** helpers from `auth.service.ts`:

- `revokeAllRefreshTokens(userId)` — deletes the user's refresh-token rows.
- `issueTokenPair(user)` — the existing access+refresh generation, exported so the
  password-change controller can set fresh cookies.

`getMe` (backing both `/auth/me` and `/users/me`) gains `profileImage`, `emailChangedAt`,
`passwordChangedAt` on the returned `SafeUser`.

Controllers stay Prisma-free (three-tier rule): extract req → call one service → shape
`res`. The password-change **controller** sets the reissued cookies (cookie handling is
already controller-level in `auth.controller.ts`).

## 5. Frontend

New route `/(app)/profile`:

- **Avatar:** presign → PUT → confirm → preview → remove, reusing the account-setup
  upload component shape. Fallback stays initials.
- **Identity (read-only):** `name`, `nic` shown but not editable.
- **Contact form:** `phone`, `address`, `city` → `PATCH /users/me/profile`.
- **Credentials:** change-email and change-password forms, each requiring the current
  password. When in cooldown, the submit is disabled and the form shows
  "you can change this again on `<nextAllowedAt>`".

**Site-wide:** wire `AvatarImage src={user.profileImage}` into `TopBar` (initials
fallback retained). Current-user avatar spots (TopBar, dashboard greeting) use it.
*Other users'* avatars (e.g. marker grading rows) are an explicit follow-up — those
list endpoints don't return `profileImage` yet, and adding it there is out of scope.

**Entry point:** the top-right user menu (`TopBar`) gains a **Profile** item — a `Link`
to `/profile` for every role, following the existing "Account setup" `Link` pattern in
that dropdown (placed above "Sign out"). This is how the user reaches the profile page.

`lib/types.ts` gains `profileImage`, `emailChangedAt`, `passwordChangedAt` on the user
type; `lib/api` calls for the new endpoints.

## 6. Edge cases (§3.4 brainstorm)

- **Actor × target:** every endpoint is self-scoped from the token; none accepts a
  target id, so the privileged-target guard does not apply. Verify no `/me/*` handler
  reads an id from the body/params.
- **Email uniqueness:** collision → `409 EMAIL_ALREADY_EXISTS` (reuse register's code).
  Case-insensitive compare consistent with `register()`.
- **Same email / same password:** rejected `400` before the window is consumed.
- **Cooldown vs auth ordering:** password verified first (401) → cooldown (429).
- **Avatar validation:** content-type allowlist + 5 MB cap enforced at presign; confirm
  re-checks the key prefix and HeadObject existence.
- **Avatar replace:** a new confirm overwrites `profileImage`; the old object is left in
  the bucket (cheap; a cleanup pass is a possible follow-up, not built now).
- **Concurrent confirm:** naturally idempotent (HeadObject + set same URL).

## 7. Testing

- **Backend Vitest** (`profile.service.test.ts`, mock `@/config/database`, `@/utils/r2`,
  `@/services/auth.service` helpers):
  - contact update ignores/strips locked fields (nic/name/email/role never written);
  - avatar confirm prefix guard (403) + 409 when object absent + persists public URL;
  - email change: wrong password → 401, in-window → 429, same email → 400, duplicate →
    409, success sets `emailChangedAt`;
  - password change: wrong password → 401, in-window → 429, same password → 400, success
    hashes + sets `passwordChangedAt` + calls `revokeAllRefreshTokens`.
- **Frontend RTL:** avatar upload confirm + preview; cooldown disables the credential
  submit and renders the next-allowed date.
- **Live-stack + headless smoke** before the PR (drive `/profile`: upload avatar, edit
  contact, change password → verify re-cookie, attempt second email change → 429).

## 8. Out of scope / follow-ups

- Email-verification link on email change (no email infra exists).
- Other users' avatars in list endpoints (marker grading rows, admin user lists).
- Orphaned-avatar cleanup after replace.
- Admin NIC-photo review UI (already-flagged separate follow-up).
