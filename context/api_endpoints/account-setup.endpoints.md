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
| **LMS QR** | `User.barcode` | The LMS itself, **automatically at registration** (decision 2026-07-10) | Globally unique | Shown as a QR in-app (`/attendance`); scanned at any LMS-operated entrance. |
| **Institute barcode** | `StudentBarcode` | Each physical institute's own pre-existing card system | Unique **per institute** (`@@unique([instituteId, barcode])`), not global | A student types in a code an institute *already gave them* on a physical card — this is a plain text field, never a scan/photo, in our UI. |

`User.barcode` is derived from the student's `indexNumber` (`LMS-<indexNumber padded to 6 digits>`,
e.g. `LMS-000123`) — guaranteed collision-free with no generate-and-retry loop, since `indexNumber`
is already a unique autoincrement. An Admin can still reassign it later via the existing
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
| `POST` | `/nic/upload-url` | `STUDENT` | Presigns a direct-to-R2 PUT for one NIC photo (front or back). |
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
The DB row is written **eagerly, at URL-generation time** (same pattern as
`generateExamPaperUploadUrl`) — the server never receives the actual bytes, only this metadata
call. `setupCompleted` in the response reflects the account state *after this write*: `true` only
once both `nicFrontUrl` and `nicBackUrl` are set (computed server-side from whichever side wasn't
just written, in the same request — no separate "confirm" step needed).

The client then does a plain `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })`
straight to R2 — verified with a real PUT against live R2 credentials (unlike Bunny/Zoom, R2 is
already provisioned and working).

## `GET /institute-barcodes` / `POST /institute-barcodes` / `DELETE /institute-barcodes/:barcodeId`

Self-scoped CRUD over the caller's own `StudentBarcode` rows.

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
| `BARCODE_TAKEN_AT_INSTITUTE` | 409 | That barcode *value* is already registered by someone else at this institute (`@@unique([instituteId, barcode])` — the same value is fine at a *different* institute) |
| `STUDENT_BARCODE_NOT_FOUND` | 404 | `DELETE` on a barcode that doesn't exist or isn't the caller's own (ownership-scoped, not just existence) |

All four verified end-to-end on the production stack, including the cross-institute case (same
barcode value accepted at institute B after being taken at institute A) and the ownership check
(student B gets 404, not 403, deleting student A's row — existence is deliberately not confirmed
to a non-owner).

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
