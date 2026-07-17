# Session status — teacher-marker-visibility-scoping

> Scratch tracking file so a new session (e.g. after a weekly-limit cutoff) can resume without
> re-deriving context. Not part of the feature itself — safe to delete after the PR merges.

**Branch:** `feature/teacher-marker-visibility-scoping` (off `dev`, pushed to origin)
**Spec:** `docs/superpowers/specs/2026-07-15-teacher-marker-visibility-scoping-design.md` (committed)
**Plan:** `docs/superpowers/plans/2026-07-15-teacher-marker-visibility-scoping.md` (committed, 6 tasks)
**Execution mode:** subagent-driven (superpowers:subagent-driven-development) — fresh subagent per
task, two-stage review between tasks.

## Progress

| Task | Status |
|---|---|
| 1. `exam.service.ts` — listExams/getExamById | **done** (commit `9a49ed9`, review clean) |
| 2. `video.service.ts` — listVideosByClass/getVideoById/generateStreamUrl | **done** (commit `c64f47e`, review clean) |
| 3. `submission.service.ts` — listSubmissions | **done** (commits `075230c..3e094c4`, 1 fix round, review clean) |
| 4. `class-session.service.ts` — listClassSessions/getClassSessionById | **done** (commit `60de74c`, review clean) |
| 5. Endpoint docs + architecture.md + CLAUDE.md | **done** (commit `378768f` + comment-fix `1700efc`, review clean) |
| 6. Live-stack verification + progress-tracker update + PR | **done** — final whole-branch review: "Ready to merge: Yes with minor follow-ups" (commit `4d8ec3d`). PR next. |

## ALL 6 TASKS COMPLETE. Only remaining step: open + merge the PR (see below).

## How to resume

1. `git checkout feature/teacher-marker-visibility-scoping && git log --oneline -10` — confirm which
   task commits already landed (each task ends in its own commit per the plan).
2. Update the table above to match reality (a task is "done" once its commit exists).
3. Re-invoke `superpowers:subagent-driven-development` against
   `docs/superpowers/plans/2026-07-15-teacher-marker-visibility-scoping.md`, starting at the first
   task whose checkboxes aren't all `[x]` in the plan file itself (the plan's own checkboxes are the
   authoritative per-step record — this table is just a faster human-readable summary).
4. Nothing else is pending outside this plan — the earlier pay-at-entrance feature (PR #68) and the
   docs reality-check pass (PR #70) are both already merged to `dev`.

## Notes carried from this session

- All 4 new test files must mock `@/services/class.service` (`assertCourseAccess`) and, where the
  service under test imports them, `@/services/stream.service` (→ `{}`) and
  `@/services/notification.service` (→ `{ dispatch: vi.fn() }`) — otherwise importing the service
  under test pulls in a real Redis/BullMQ connection and hangs. Precedent:
  `backend/src/services/upload-confirm.service.test.ts`.
- Indentation is per-file: `exam.service.ts` uses tabs; `video.service.ts`/`submission.service.ts`/
  `class-session.service.ts` use 2 spaces. Every `.test.ts` file uses tabs regardless of its
  service file's own style.
- `assertCourseAccess`/`AuthenticatedUser` are already imported in `exam.service.ts`,
  `video.service.ts`, and `class-session.service.ts` — no import changes needed there. Only
  `submission.service.ts` needs both added (Task 3, Step 3).
- Never delete `feature/teacher-marker-visibility-scoping` after merge (repo convention).
- Both Task 3-review comment nits are now resolved (fixed during Task 5): the stale
  `submission.service.ts:397` comment and the misleading/inconsistent test comments in
  `submission.service.test.ts` (fixed twice — Task 5's implementer introduced a new inaccuracy on
  its first pass, corrected directly by the controller in commit `1700efc`). Nothing outstanding
  here for the final review.
- **Important:** this branch was cut from `dev` right after PR #69 merged but BEFORE PR #70 (the
  docs reality-check pass) merged — it was missing `06-progress-tracker.md`/frontend-roadmap
  updates until `origin/dev` was explicitly merged in during Task 6 (merge commit, then
  `1b92641`). If resuming and `git merge-base origin/dev feature/teacher-marker-visibility-scoping`
  doesn't equal `origin/dev`'s tip, merge `origin/dev` in again before touching those two files.
- Live-stack smoke (Task 6) overwrote the password hash for two demo TEACHER accounts
  (`k.perera@lms.demo`, `s.fernando@lms.demo`) to a known test password to log in via curl — this
  is throwaway local-Docker demo data, not production; no action needed, just flagging in case
  those accounts' original passwords mattered for something else.
- A background automated security scanner flagged the Task 3 two-`if` gate (MARKER/TEACHER) as
  "fail-open" for unrecognized roles and suggested a default-deny switch. Deliberately NOT applied:
  the route already restricts this endpoint to SUPER_ADMIN/TEACHER/MARKER only, and SUPER_ADMIN's
  fall-through (no check) is the intended behavior, matching `assertCourseAccess`'s own documented
  SUPER_ADMIN-bypasses-unconditionally pattern used everywhere else in this codebase. The bot's
  suggested `default: throw 403` would break correct SUPER_ADMIN access. No action needed unless a
  future session independently re-derives the same finding — if so, this note explains why it was
  dismissed.
