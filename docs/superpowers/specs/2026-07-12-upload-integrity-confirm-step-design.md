# Upload integrity — confirm-step for direct-to-R2 uploads

**Date:** 2026-07-12
**Status:** Design — awaiting review
**Type:** Bugfix (behavioral change to a documented pattern)

## Problem

Direct-to-R2 uploads (NIC photos, exam paper PDFs, student answer PDFs) presign a
browser `PUT` and **eagerly write the DB row / completion flag at presign time** —
the server never confirms the file actually arrived. Two failure modes result:

1. **False success.** If the browser `PUT` fails (e.g. the R2 bucket CORS policy
   doesn't allow the app origin — the live cause today; verified: server-side PUT
   → `200`, browser CORS preflight → `403` with no `Access-Control-Allow-Origin`),
   the UI shows "Upload failed" but a refresh reads the eagerly-written row and
   shows "done." `setupCompleted` can flip for a NIC photo that was never stored.
2. **No preview / weak feedback.** After a successful upload there's no visual
   confirmation of what was uploaded.

> **Out of scope / config, not code:** the R2 bucket CORS policy itself is a
> Cloudflare-dashboard setting (the app's access key is scoped to object
> read/write and cannot call `PutBucketCors`). Applying it is a runbook step
> (see `context/documents/`), not part of this change. This spec makes the app
> *truthful* about upload success regardless of why a PUT fails.

## Affected upload sites (all three get the same treatment)

| Flow | Presign (today, eager) | Deterministic key |
|---|---|---|
| NIC photo | `user.service.generateNicUploadUrl` writes `nicFrontUrl`/`nicBackUrl` + flips `setupCompleted` | `nic/<userId>/<side>-<fileName>` |
| Exam paper PDF | `exam.service` writes `exam.paperPdfUrl` | `exam-papers/<examId>/<fileName>` |
| Answer PDF | `submission.service` writes `submission.answerPdfUrl` | `answers/<examId>/<userId>/<fileName>` |

## Design

**Split presign from persistence.** Presign returns `{ uploadUrl, key, expiresAt }`
and writes **nothing** about completion. A new **confirm** call, made by the client
*after* the browser `PUT` resolves, `HEAD`s the object in R2 and only then persists
the key / flips the flag. State becomes a fact about R2, not an assumption.

### New util — `r2HeadObject(key)`
`backend/src/utils/r2.ts`: `HeadObjectCommand` → `{ exists: boolean; size?: number; contentType?: string }`
(catches `NotFound`/`404` → `exists:false`; other errors rethrow). Reuses the same
scoped S3 client — `HeadObject` is an object read, within the key's permissions.

### Key-ownership guard
Confirm accepts the `key` returned by presign but **strictly validates its prefix**
against the caller/entity before `HEAD` — `nic/<userId>/`, `exam-papers/<examId>/`,
`answers/<examId>/<userId>/`. A mismatch → `403 FORBIDDEN_KEY`. Prevents a client
confirming an arbitrary object it doesn't own.

### Endpoints
- `POST /api/users/me/nic/confirm` (STUDENT) — body `{ side, key }`. Validate prefix →
  `HEAD` → if missing `409 UPLOAD_NOT_FOUND` ("We couldn't find the uploaded photo —
  please try again."); else write the side's key, flip `setupCompleted` when the other
  side is already stored. Returns `{ setupCompleted }`.
- `POST /api/exams/:id/paper/confirm` (TEACHER/SUPER_ADMIN, `assertCourseAccess`) —
  body `{ key }`. Same MCQ/deleted guards as presign. `HEAD` → write `paperPdfUrl`.
- `POST /api/submissions/:id/answer-pdf/confirm` (STUDENT, owner) — body `{ key }`.
  `HEAD` → write `answerPdfUrl`. (The submission row still exists from `start`; only
  the PDF key is deferred to confirm.)

Presign endpoints stay the same URL/shape minus the eager write; the `setupCompleted`
field on the NIC presign response is dropped (the confirm response carries it).

### Frontend
Each uploader becomes: presign → `PUT` → **confirm** → only then mark done. On a
failed `PUT` **or** a failed confirm, show the error and leave state not-done (no
false "done" on refresh, because nothing was persisted).
- `AccountSetupForm` (NIC): call confirm after the `PUT`; **mini preview** thumbnail
  from the local `File` via `URL.createObjectURL` (revoked on unmount), shown per side
  once confirmed.
- Exam authoring `ExamForm` paper-PDF upload: confirm + a "PDF attached ✓" state.
- Submission answer-PDF (`ExamSit`/answer panel): confirm before the submission is
  treated as having a PDF.

## Edge cases → tests (Vitest)

Backend (mock `@/config/database` prisma + `r2HeadObject`):
- confirm with object present → persists key / flips flag; **absent** → `409`, no write.
- NIC: confirm FRONT then BACK → `setupCompleted` flips only on the second; re-confirm
  is idempotent (same key rewritten, still `SUCCESS`).
- key prefix not owned by caller/entity → `403 FORBIDDEN_KEY` (before any `HEAD`).
- exam: MCQ exam / deleted exam still rejected at confirm; non-owner teacher `403`.
- answer PDF: confirming another student's submission → `403`/`404`.

Frontend (Vitest + RTL): failed `PUT` → error, not-done; presign→PUT→confirm happy path
marks done + renders preview; confirm-missing → inline error.

## Verification
Unit (backend + frontend) + `tsc`/build/lint, then a live Docker-stack smoke **after
the R2 CORS policy is applied**: real browser (headless) NIC upload → confirm →
`setupCompleted` reflects a truly-stored object; a forced PUT failure leaves state
not-done; exam + answer PDF round-trips.

## Not in this change (separate spec)
Teacher/marker **visibility scoping** (only see assigned classes / exam markings;
front-desk ADMIN can't see teacher content or submissions) — surfaced during this
investigation, tracked separately.
