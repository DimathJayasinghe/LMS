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
| 3. `submission.service.ts` — listSubmissions | not started |
| 4. `class-session.service.ts` — listClassSessions/getClassSessionById | not started |
| 5. Endpoint docs + architecture.md + CLAUDE.md | not started |
| 6. Live-stack verification + progress-tracker update + PR | not started |

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
