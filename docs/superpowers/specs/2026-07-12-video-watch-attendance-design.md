# Video-watch attendance — Design

_Date: 2026-07-12 · Branch: `feature/video-watch-attendance` (off `dev`)_

## 1. Goal

Wire the existing `POST /attendance/video` so that **watching a recording marks attendance** —
closing a documented gap (the endpoint exists but nothing calls it). Attendance is recorded once the
student has actually **watched ≥ 30s** (or reached the end of a shorter clip). Also **add the missing
enrollment gate** to the endpoint (today any student can POST for any session).

## 2. Backend

`markVideoAttendance` (`attendance.service.ts`):
- Change signature from `(userId, classSessionId)` → `(actor: AuthenticatedUser, classSessionId)`.
- `ensureClassSessionExists` already returns the session's `courseId`; use it to run
  **`assertStudentContentAccess(actor, courseId, { requirePaid: false })`** — a student can only mark
  video-attendance for a course they're **enrolled** in (payment is already enforced when issuing the
  stream token, so enrollment is the right gate here). Not-enrolled → `NOT_ENROLLED` (403).
- Upsert + `source: ZOOM_WEBHOOK` unchanged (no new `AttendanceSource.VIDEO` enum → no migration).
- Controller passes `req.user!` instead of `req.user!.userId`.
- **Vitest** (`attendance.service.test.ts`): enrolled student → upserts; not-enrolled → `NOT_ENROLLED`;
  deleted session → `CLASS_SESSION_NOT_FOUND` (§3.4).

## 3. Frontend

Since playback is now Bunny's **iframe**, watch-progress comes from **`player.js`** (Bunny's player is
Player.js-compatible), not a `<video>` element.

- `lib/watch.ts` — a **pure** `accumulateWatch(state, seconds)` helper: given the running state
  `{ watched, lastSeconds }` and a new reported `seconds`, add the delta only when it's a small forward
  step (`0 < delta ≤ 2`) so seeks/rewinds/pauses don't inflate it; return the new state + whether the
  threshold (30s) was crossed this tick. Pure → unit-tested without an iframe.
- `VideoPlayer.tsx`:
  - New prop `classSessionId` (the page already has it on the video record).
  - After the iframe mounts, attach `new playerjs.Player(iframe)`; on `ready`, subscribe to
    `timeupdate` (`{ seconds, duration }`) and `ended`.
  - Feed `timeupdate.seconds` into `accumulateWatch`; when it crosses **30s**, or on `ended`, call
    `POST /attendance/video { classSessionId }` **once** (guarded by a ref). Failures are swallowed
    (attendance is best-effort; never block playback or surface an error over the video).
- `videos/[videoId]/page.tsx`: pass `classSessionId={video.classSessionId}` to `VideoPlayer`.
- Dependency: add `player.js` (small, framework-agnostic).

## 4. Edge cases

- **Short video (< 30s):** `ended` fires the mark.
- **Seeking to the end / scrubbing:** ignored (delta guard) — can't skip to 30s to game it.
- **Re-watch / remount:** upsert is idempotent; the once-guard is per mount, backend dedupes anyway.
- **player.js fails to attach** (rare): no attendance marked, playback unaffected (best-effort).
- **Not enrolled** (shouldn't happen — they got the stream): endpoint returns 403, swallowed.

## 5. Testing

- **Backend Vitest** — the gate (enrolled ok / not-enrolled `NOT_ENROLLED` / deleted session).
- **Frontend Vitest** — `accumulateWatch`: accumulates forward ticks, ignores backward/large jumps,
  reports threshold-crossed exactly once; plus a `VideoPlayer` test that a simulated cross-threshold
  (via a mocked player.js emitting `timeupdate`) fires `POST /attendance/video` once.
- **System** — backend + frontend build/tsc/lint.
- **Live** — the Bunny pipeline is already verified; do a short check that a real watch (temporarily
  lowering the threshold if needed) records attendance, visible on `/attendance` (staff roster) and
  the student's history. No fragile 30s headless wait.

## 6. Definition of done

- Watching a recording records attendance after ~30s (or end); endpoint enrollment-gated.
- Backend + frontend unit tests, builds/lint green; short live confirmation.
- Docs: `attendance.endpoints.md` (video path now wired + gated + threshold), roadmap.
