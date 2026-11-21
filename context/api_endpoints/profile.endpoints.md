# Profile + Credential Management API Endpoints

> Self-service account management for **every authenticated role**: profile photo, contact
> details, and sign-in credentials. All routes are self-scoped — the target is always the caller
> (`req.user.userId` from the access-token cookie); none accepts a target id, so the
> privileged-actor-vs-target guard does not apply here.

## Base URL

```
http://localhost:5000/api/users/me
```

## Identity fields are read-only here

`name` and `nic` are **not** editable via these endpoints — they are identity fields set at
registration and only an Admin can change them (via the existing `/api/users/:id/*` admin routes).
`updateProfileSchema` is `.strict()`, so a request that smuggles `name`, `nic`, `role`, `email`, or
any unexpected key is rejected `400` at validation.

## Public avatar storage (separate bucket)

Avatars are stored in a **separate public R2 bucket** (the main bucket is private — NIC photos and
exam PDFs), and `User.profileImage` holds the **public CDN URL** (not a private R2 key). This needs
two env vars — `R2_PUBLIC_BUCKET_NAME` and `R2_PUBLIC_URL` — plus a one-time **Cloudflare dashboard**
step: create the public bucket, enable public access, and add its CORS rule for the app origin
(the app's S3 key cannot enable public access or set `PutBucketCors` itself). If either env var is
unset, the avatar endpoints return `503 R2_NOT_CONFIGURED`.

## Endpoints Summary

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `PATCH` | `/profile` | any auth | Update own contact details (`phone`, `address`, `city`). |
| `POST` | `/avatar/upload-url` | any auth | Presign a direct-to-public-R2 PUT for the avatar. Persists nothing. |
| `POST` | `/avatar/confirm` | any auth | HeadObject-verify the avatar landed, then persist its public URL. |
| `DELETE` | `/avatar` | any auth | Remove own avatar (`profileImage = null`, best-effort object delete). |
| `PATCH` | `/email` | any auth | Change own email (current password + 7-day cooldown). |
| `PATCH` | `/password` | any auth | Change own password (current password + 7-day cooldown; revokes all sessions). |

`GET /api/auth/me` now also returns `profileImage`, `emailChangedAt`, and `passwordChangedAt`
(alongside the existing self fields) so the frontend can render the avatar and compute the
credential-change cooldown lock.

---

## `PATCH /profile`

**Request** (all fields optional; only contact fields accepted)
```json
{ "phone": "0771234567", "address": "12 Main St", "city": "Colombo" }
```

**Success (200)** — the updated self user (same shape as `/auth/me`, minus the presence flags).

**Errors** — `400` validation (including any non-contact key, e.g. `role`, via `.strict()`).

## `POST /avatar/upload-url`

**Request**
```json
{ "fileName": "me.jpg", "contentType": "image/jpeg", "fileSizeBytes": 512345 }
```
`contentType`: `image/jpeg | image/png | image/webp`. `fileName` matches
`^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$`. `fileSizeBytes` ≤ 5 MB (`AVATAR_IMAGE_MAX_SIZE_BYTES`).

**Success (200)**
```json
{
  "status": "success",
  "data": {
    "uploadUrl": "https://<public-bucket>.r2.cloudflarestorage.com/...",
    "key": "avatars/<userId>/<uuid>.jpg",
    "expiresAt": "2026-07-13T10:15:00.000Z"
  }
}
```
Presign **persists nothing**. The client PUTs straight to the public bucket, then confirms.

**Errors** — `503 R2_NOT_CONFIGURED` (public bucket env not set).

## `POST /avatar/confirm`

**Request**
```json
{ "key": "avatars/<userId>/<uuid>.jpg" }
```
The server re-validates the key prefix is `avatars/<callerId>/` (→ `403 FORBIDDEN_KEY`) before
HeadObject-checking the public bucket.

**Success (200)** — `{ "status": "success", "data": { "profileImage": "<publicBaseUrl>/avatars/..." } }`.

**Errors** — `403 FORBIDDEN_KEY` (key not owned by caller), `409 UPLOAD_NOT_FOUND` (object not in the
bucket — the PUT never landed; re-upload), `503 R2_NOT_CONFIGURED`.

## `DELETE /avatar`

**Success (200)** — `{ "status": "success", "data": { "profileImage": null } }`. Clears the DB field
and best-effort-deletes the object (a failed object delete never fails the request).

## `PATCH /email`

**Request**
```json
{ "currentPassword": "…", "newEmail": "new@example.com" }
```

**Check order** (deliberate — a failed auth never leaks cooldown state):
current password → cooldown → same-value → uniqueness.

**Success (200)** — the updated self user with the new `email` + a fresh `emailChangedAt`.

**Errors**

| Code | Status | Cause |
|------|--------|-------|
| `INVALID_CREDENTIALS` | 401 | Current password incorrect. |
| `EMAIL_CHANGE_TOO_SOON` | 429 | Changed within the last 7 days. The message names the next-allowed date; the exact date is also derivable from `emailChangedAt` on `/auth/me`. |
| `SAME_EMAIL` | 400 | `newEmail` equals the current email — rejected **without** consuming the weekly window. |
| `EMAIL_ALREADY_EXISTS` | 409 | Another account already uses that email. |

## `PATCH /password`

**Request**
```json
{ "currentPassword": "…", "newPassword": "at-least-8-chars" }
```

On success the server hashes + stores the new password, sets `passwordChangedAt`, clears `mustChangePassword`, bumps the account's `tokenVersion` (every other session answers `401 SESSION_REVOKED` on its next request), **revokes every
refresh token for the user**, and **reissues a fresh access + refresh cookie pair** for the current
session (so the calling device stays signed in while all other devices are signed out on their next
refresh).

**Success (200)** — `{ "status": "success", "data": null, "message": "Password updated. Other sessions were signed out." }` with new `Set-Cookie` headers.

**Errors**

| Code | Status | Cause |
|------|--------|-------|
| `INVALID_CREDENTIALS` | 401 | Current password incorrect. |
| `PASSWORD_CHANGE_TOO_SOON` | 429 | Changed within the last 7 days (message names the next-allowed date). |
| `SAME_PASSWORD` | 400 | `newPassword` equals the current password — rejected **without** consuming the window. |

---

## Cooldown

The gap between self email/password changes is 7 days (`CREDENTIAL_CHANGE_COOLDOWN_MS`; a change forced by a staff reset is exempt), enforced via
the durable `emailChangedAt` / `passwordChangedAt` columns (not Redis TTL keys — survives a Redis
flush and stays auditable). The two counters are independent.

## Known follow-ups (flagged, not built)

- **Email-verification link** on email change — no email-sending infra exists (SMS only), so email
  change is a direct change guarded by the current password.
- **Other users' avatars** in list endpoints (marker grading rows, admin user lists) don't yet
  return `profileImage` — only the current user's avatar renders site-wide for now.
- **Orphaned-avatar cleanup** after replace (the old object is left in the bucket).
