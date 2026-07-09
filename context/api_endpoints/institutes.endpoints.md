# Institutes API Endpoints

Pre-configured **physical centers** (Super-Admin allowlist). Students register a
per-institute barcode during account setup. Not a tenant boundary — one LMS.

## Base URL

```
http://localhost:5000/api/institutes
```

## Auth

All endpoints require the `access_token` cookie.

## Roles

- **SUPER_ADMIN** — create / update institutes.
- Everyone authenticated — read. Non–SUPER_ADMIN see **active only** (students pick from these at setup).

## Data Shape

### Institute

```json
{
  "id": "uuid",
  "name": "Nugegoda Center",
  "code": "NUG",
  "city": "Nugegoda",
  "isActive": true,
  "createdAt": "2026-07-09T00:00:00.000Z",
  "updatedAt": "2026-07-09T00:00:00.000Z"
}
```

## Endpoints

| Method | Path | Roles | Description |
| ------ | ---- | ----- | ----------- |
| POST | `/api/institutes` | SUPER_ADMIN | Create an institute |
| GET | `/api/institutes` | Any | List institutes (`?search=`) |
| GET | `/api/institutes/:id` | Any | Get an institute |
| PATCH | `/api/institutes/:id` | SUPER_ADMIN | Update an institute |

### POST `/api/institutes`

Body:
```json
{ "name": "Nugegoda Center", "code": "NUG", "city": "Nugegoda", "isActive": true }
```
- `name` — required, 2–120, unique.
- `code` — required, 2–20, unique.
- `city` — optional, ≤120.
- `isActive` — optional (default `true`).

`201` → `{ status, data: Institute, message }`. Duplicate name **or** code → `409 INSTITUTE_ALREADY_EXISTS`.

### GET `/api/institutes?search=nug`

`200` → `{ status, data: Institute[], count }`. Search matches `name` or `code`. Non–SUPER_ADMIN receive active only.

### PATCH `/api/institutes/:id`

Body: any subset of `{ name, code, city, isActive }`. `200` → updated Institute. Name/code clash → `409`.

---

> **Note — student institute barcodes**: registering a student's per-institute
> barcode (`StudentBarcode`, unique per `(instituteId, barcode)`) is part of the
> **account-setup flow**, which is not yet exposed (see Progress Tracker).
