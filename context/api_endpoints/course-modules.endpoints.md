# Course Modules and Materials Endpoints

Base path: `/api/classes/:classId/modules`. All routes require cookie authentication. Private R2
object keys are never returned by list endpoints; only a short-lived, authorized download URL is
returned by the download endpoint.

## Access policy

| Actor | List | Manage modules/materials | Download |
|---|---|---|---|
| SUPER_ADMIN | Every class | Every class | Yes |
| Owning TEACHER | Own classes | Own classes | Yes |
| Other TEACHER | 403 | 403 | 403 |
| STUDENT | Active enrollment; released/published only | No | Active enrollment + current-month successful payment |
| ADMIN / MARKER | 403 | 403 | 403 |

## Module routes

- `GET /` — ordered active modules. Students receive only `PUBLISHED` modules whose `releaseAt` is
  null or in the past. Each module embeds active materials without storage keys.
- `POST /` — create a module. Requires `Idempotency-Key`.
- `PATCH /:moduleId` — edit title, description, position, `DRAFT`/`PUBLISHED` status, or release
  time. Requires `Idempotency-Key`.
- `DELETE /:moduleId` — idempotent soft removal; contained materials are also hidden and tracked
  files are deleted best-effort. Requires `Idempotency-Key`.

Create example:

```json
{
  "title": "Mechanics",
  "description": "Forces, motion, and momentum",
  "position": 0,
  "status": "DRAFT",
  "releaseAt": null
}
```

## Private file flow

Accepted types are PDF, JPG, PNG, and WebP. Maximum stored size is 25 MB; images are fully decoded
under a 25-megapixel cap. PDFs must have a valid PDF header and completion trailer.

1. `POST /:moduleId/materials/upload-url` with `fileName`, `contentType`, and `fileSizeBytes`.
2. PUT the raw bytes to the returned URL using exactly the same `Content-Type`.
3. `POST /:moduleId/materials/confirm` with the returned key, display title, original filename, and
   optional description/position/downloadable flag. Confirmation requires `Idempotency-Key`.

Confirmation reauthorizes class ownership, requires the key prefix to match the class and module,
HEAD-checks stored MIME/size, bounded-fetches and decodes the content, normalizes the download
filename to the verified type, and deletes rejected objects best-effort.

- `PATCH /:moduleId/materials/:materialId` — edit title, description, position, or downloadable
  flag. Requires `Idempotency-Key`.
- `DELETE /:moduleId/materials/:materialId` — idempotent soft removal and best-effort object
  cleanup. Requires `Idempotency-Key`.
- `GET /:moduleId/materials/:materialId/download` — repeats role, class, release, enrollment, and
  current-payment checks, then returns a 15-minute private R2 URL with attachment disposition.

Signed upload/download URLs and object keys must never be written to audit metadata or logs.
