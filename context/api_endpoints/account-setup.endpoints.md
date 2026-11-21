# Account Setup API Endpoints

> Mandatory one-time student onboarding: NIC front/back photo upload (direct-to-R2, same
> "server never touches the file" principle as exam PDFs — architecture §5.6) plus optional
> per-institute barcode registration. Gates `User.setupCompleted`, which the frontend's
> `(app)/layout.tsx` enforces by redirecting an incomplete STUDENT to `/auth/account-setup`
> before any other screen renders.

## Base URL

```
http://localhost:5000/api/users/me
```

## Two identifiers — do not conflate them

| Identifier | Field | Issued by | Scope | Purpose |
|---|---|---|---|---|
| **LMS QR** | `User.barcode` | The LMS itself, **automatically at registration** (decision 2026-07-10) | Globally unique; the `LMS-<number>` format is reserved for this writer | Shown as a QR in-app (`/attendance`); scanned at any LMS-operated entrance. |
| **Institute barcode** | `StudentBarcode` | Each physical institute's own pre-existing card system | The database constraint is per institute (`@@unique([instituteId, barcode])`), but the service refuses any value another student already holds, at any institute or as an LMS card (2026-11-21, audit F-07) | A student types in a code an institute *already gave them* on a physical card — this is a plain text field, never a scan/photo, in our UI. |

`User.barcode` is derived from the student's `indexNumber` (`LMS-<indexNumber padded to 6 digits>`,
e.g. `LMS-000123`) — guaranteed collision-free with no generate-and-retry loop, since `indexNumber`
is already a unique autoincrement, and the registration write now checks it against both code tables in
the same transaction as the account (a collision fails the registration; a retry gets the next index).
An Admin can still reassign it later via the existing
`PATCH /api/users/:id/barcode` (e.g. a lost card) — auto-generation only sets the initial value.

## Architecture decisions (2026-07-10)

**No admin NIC-approval gate.** `context/documents/01-project-overview.md` §4.1 (as originally
written) described a "register → pending → Admin verifies NIC → approves" flow. That state never
existed in the schema or code (no `isApproved`/`nicVerifiedAt` field anywhere — only
`setupCompleted` and `deletedAt`), and `register()` always made accounts immediately active.
Decision: keep it that way. **`setupCompleted` auto-flips to `true` server-side the moment both
NIC photos are on file** — no blocking review step. Admins are not currently given a dedicated
NIC-photo viewing UI either (out of scope for this pass; the photos exist as private R2 objects
if that's added later).

**Institute barcodes are optional, not part of the completion gate.** Only both NIC photos are
required for `setupCompleted`. A purely-online student who never attends a physical institute has
nothing to enter here and isn't blocked by it.

## Endpoints Summary

| Method | Path | Roles | Description |
|--------|------|-------|--------------|
| `POST` | `/nic/upload-url` | `STUDENT` | Presigns a direct-to-R2 PUT for one NIC photo (front or back). Persists nothing. |
| `POST` | `/nic/confirm` | `STUDENT` | Confirms the photo actually reached R2 (HeadObject), then stores the key + flips `setupCompleted`. |
| `GET` | `/institute-barcodes` | `STUDENT` | Lists the caller's own per-institute barcodes. |
| `POST` | `/institute-barcodes` | `STUDENT` | Registers a barcode for one institute. |
| `DELETE` | `/institute-barcodes/:barcodeId` | `STUDENT` | Removes one of the caller's own barcodes. |

`GET /api/institutes` (any authenticated user, auto-filtered to `isActive: true` for non–`SUPER_ADMIN`
— see `institutes.endpoints.md`) is what the frontend's institute picker calls; nothing new was
added there.

---

## `POST /nic/upload-url`

**Request**
```json
{
  "side": "FRONT",
  "fileName": "front.jpg",
  "contentType": "image/jpeg",
  "fileSizeBytes": 812345
}
```
`side`: `"FRONT" | "BACK"`. `contentType`: `"image/jpeg" | "image/png"`. `fileName` must match
`^[A-Za-z0-9._-]+\.(jpg|jpeg|png)$`. `fileSizeBytes` max 10 MB (`NIC_IMAGE_MAX_SIZE_BYTES`).

**Success (200)**
```json
{
  "status": "success",
  "data": {
    "uploadUrl": "https://<account>.r2.cloudflarestorage.com/...",
    "key": "nic/<userId>/front-front.jpg",
    "expiresAt": "2026-07-10T18:15:00.000Z",
    "setupCompleted": false
  }
}
```
Presign **persists nothing** — no `nicFrontUrl`/`nicBackUrl`, no `setupCompleted` flip. The
`setupCompleted` field here is the *current* account state, informational only. The server never
receives the bytes; the client PUTs straight to R2, then confirms (below).

> **Why a confirm step (changed 2026-07-13).** The presign used to write the key + flip
> `setupCompleted` eagerly, before the browser PUT. A blocked/failed PUT (e.g. an R2 bucket CORS
> rule that doesn't allow the app origin) then left a photo marked "uploaded" that never landed —
> "Upload failed" in the UI but "done" after a refresh. Presign is now write-free; the DB reflects
> a photo only once `/nic/confirm` HeadObject-verifies it in R2. (R2 bucket CORS is a Cloudflare
> dashboard setting — the app's key can't set `PutBucketCors`; if browser PUTs 403 with no
> `Access-Control-Allow-Origin`, fix the bucket CORS, not the code.)

The client does `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })`
straight to R2, then calls `/nic/confirm`.

## `POST /nic/confirm`

**Request**
```json
{ "side": "FRONT", "key": "nic/<userId>/front-front.jpg" }
```
`key` is the value returned by `/nic/upload-url`; the server re-validates its prefix is
`nic/<callerId>/<side>-` (→ `403 FORBIDDEN_KEY` otherwise) before HeadObject-checking R2.

**Success (200)** — `{ "status": "success", "data": { "setupCompleted": true } }`.
`setupCompleted` flips to `true` once both sides are confirmed on file. Idempotent.

**Errors** — `403 FORBIDDEN_KEY` (key not owned by caller), `409 UPLOAD_NOT_FOUND` (object not in
R2 — the PUT never landed; re-upload).

## `GET /institute-barcodes` / `POST /institute-barcodes` / `DELETE /institute-barcodes/:barcodeId`

Self-scoped CRUD over the caller's own `StudentBarcode` rows. Codes are trimmed printable ASCII, 1–50 characters.

**`POST` request**
```json
{ "instituteId": "uuid", "barcode": "NUG-4821" }
```

**Success (201)** — the created row, with the institute joined:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "barcode": "NUG-4821",
    "instituteId": "uuid",
    "institute": { "id": "uuid", "name": "Nugegoda Center", "code": "NUG", "city": "Nugegoda" },
    "createdAt": "...",
    "updatedAt": "..."
  },
  "message": "Institute barcode registered."
}
```

**Errors**

| Code | Status | Cause |
|---|---|---|
| `INSTITUTE_NOT_FOUND` | 404 | Institute doesn't exist or `isActive: false` |
| `STUDENT_BARCODE_EXISTS` | 409 | Caller already registered a barcode for this institute — remove it first to change it (one barcode per student per institute, `@@unique([userId, instituteId])`) |
| `CODE_UNAVAILABLE` | 409 | That code is already held by another student (as an LMS card or an institute card at **any** institute, compared case-insensitively) or is in the reserved `LMS-<number>` format. The message is generic and never names the holder. Replaces `BARCODE_TAKEN_AT_INSTITUTE` (2026-11-21) |
| `STUDENT_BARCODE_NOT_FOUND` | 404 | `DELETE` on a barcode that doesn't exist or isn't the caller's own (ownership-scoped, not just existence) |

The ownership check was verified end-to-end on the production stack (student B gets 404, not 403,
deleting student A's row — existence is deliberately not confirmed to a non-owner).

---

## Known follow-ups (flagged, not built)

- **Fraud / abnormal-account detection.** Nothing currently validates NIC *authenticity* beyond
  the existing registration-time format check (old 9+`V`/`X` or new 12-digit, `auth.schema.ts`) and
  DB-level `@unique` on `nic` (no two accounts can share the same NIC number). There is no
  detection for: doctored/reused NIC photos, a name mismatch between the account and the NIC image,
  or generally abnormal account-creation/activity patterns (e.g. many accounts from one device/IP
  in a short window). Needs real usage data before designing — revisit once the platform has
  actual registration volume to characterize what "abnormal" looks like here.
- **Admin NIC-photo review UI.** The photos are uploaded and stored privately in R2, but there's no
  admin screen to view them (see "No admin NIC-approval gate" above — this was a deliberate scope
  cut, not an oversight).
