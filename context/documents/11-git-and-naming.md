# 11 — Git Workflow & Naming Conventions

> How we branch, commit, review, release, and clean up. Consistency here keeps a multi-contributor repo (backend + frontend) from drifting. Revised 2026-11-19: branch deletion after merge is now the rule (§1.4), stacked branches and worktrees are covered (§1.5, §1.6), and a cleanup runbook was added (§7).

---

## 1. Branching Model

A lightweight **trunk-with-integration** flow. Two long-lived branches, everything else short-lived:

```
main            ← production. Protected. Always deployable. Tagged releases.
  └── dev       ← integration. Protected. Every feature lands here first.
        └── <work branches>   ← short-lived; one task each; deleted after merge
```

| Branch | Role | Rules |
|--------|------|-------|
| `main` | Production truth | Protected; **no direct pushes**; updated only by a release PR from `dev`; deploys from here |
| `dev` | Integration/staging | Protected; **no direct pushes**; features squash-merge here and are tested together before a release |
| Work branches | One task | Branch off fresh `origin/dev`; short-lived; **deleted after merge** |

There are no other long-lived lanes. A backend-only or frontend-only integration branch (the old `dev-backend`) is not allowed: it forks history and strands fixes (a CORS fix once lived only there). If a task is too big for one PR, use stacked branches (§1.5), not a lane.

### 1.1 Work-branch naming

`<type>/<kebab-scope>`. **No personal prefixes** (`chathura/dev/...`). The PR author already identifies the owner, and per-person namespaces left a pile of abandoned, unmerged `chathura/dev/*` branches.

| Type | Use for | Example |
|------|---------|---------|
| `feature/` | New capability | `feature/payment-slips` |
| `fix/` | Bug fix | `fix/exam-timer-off-by-one` |
| `hotfix/` | Urgent production fix, branched from `main` (§5.2) | `hotfix/payhere-webhook-signature` |
| `chore/` | Tooling, deps, config | `chore/bump-prisma-7` |
| `docs/` | Docs only | `docs/cost-and-hosting` |
| `refactor/` | No behaviour change | `refactor/extract-course-access` |
| `test/` | Tests only | `test/attendance-concurrency` |

- Lowercase, `kebab-case`, no spaces, no dates, no ticket numbers alone. Short and specific: `feature/pay-at-entrance`, not `feature/payments`.
- One task per branch. If the scope grows past ~5 files or two domains, split it (see [04-ai-workflow-rules.md](./04-ai-workflow-rules.md)).
- Reserved: `main`, `dev`, `release/*` (not currently used), `hotfix/*`.

### 1.2 Lifecycle

```bash
git fetch origin
git switch -c feature/pay-at-entrance origin/dev     # always from fresh origin/dev
# ...commit small, logical steps...
git push -u origin feature/pay-at-entrance
gh pr create --base dev
# CI green + review → squash-merge → branch is auto-deleted on GitHub
git switch dev && git pull --ff-only
git branch -d feature/pay-at-entrance                # squash merges need -D, see §1.4
```

Never commit straight to `dev` or `main`, even for a one-line fix (restated 2026-07-10 after a stretch of direct-to-`dev` commits). Run the checks locally first (`cd backend && npm run test`; `npx tsc --noEmit` in `backend/` and `frontend/`) so CI confirms rather than discovers.

### 1.3 Keeping a branch current

Rebase onto `origin/dev` while the branch is private and unreviewed; once others have commented, merge `origin/dev` in instead of rewriting reviewed history. After a rebase push with `git push --force-with-lease` — **only on your own work branch**, never `dev`/`main`, never plain `--force`.

Prisma migrations are the usual conflict. Never hand-merge two migration folders: rebase, delete your new migration, regenerate it (`prisma migrate dev --name ...`) on top of the latest schema, and re-run the drift gate.

### 1.4 Deleting branches after merge

**Delete the work branch as soon as its PR is merged.** This reverses the 2026-07-10 rule ("never delete a branch after merging"). Reasons for the change:

- Squash-merge creates a new commit on `dev`; the original branch tip is never an ancestor of `dev`, so merged branches look "unmerged" forever. By 2026-11-19 there were 52 merged-but-present remote branches mixed with 15 truly abandoned ones, and nobody could tell them apart.
- GitHub keeps the PR, its commits and a "Restore branch" button after deletion, so no work is lost.
- Continuing work after a merge is still allowed: create a new branch from fresh `origin/dev` (`feature/payment-slips-followup`). Do not re-use the merged branch name.

Mechanics:

- GitHub setting **Automatically delete head branches** is ON, so remote branches disappear on merge.
- Locally: `git fetch --prune`, then delete with `git branch -D <name>` for squash-merged branches (`-d` refuses because the tip is not an ancestor). Only after confirming the PR shows *Merged* (`gh pr view <name> --json state`).
- Never delete a branch with an open PR, or one whose last commit is not in a merged PR (it may be someone's unpushed-elsewhere work). Ask first.

### 1.5 Stacked branches

When PR B depends on unmerged PR A, base B on A's branch (`gh pr create --base feature/a`). When A squash-merges and its branch is auto-deleted, GitHub retargets B to `dev` automatically only if the base branch was deleted *by the merge*; otherwise retarget manually (`gh pr edit <B> --base dev`). Then rebase B onto `origin/dev`, dropping A's now-squashed commits (`git rebase --onto origin/dev <A-tip-before-merge> feature/b`). Do not stack more than two deep.

### 1.6 Worktrees

- Default: work in the **main checkout**. Do not leave work only in a worktree: a worktree is a second working copy, not a backup, and removing one with `--force` discards anything uncommitted.
- A worktree is fine for parallel, long-running branches or reviewing a PR while keeping your tree dirty. Put them in `.worktrees/<branch-name>` (gitignored) and nowhere else in the repo.
- Every worktree needs its own `npm ci` in `backend/` and `frontend/`; that `node_modules` is untracked and expendable.
- After the branch merges: `git worktree remove .worktrees/<name>` then delete the branch (§1.4). Run `git worktree prune` during cleanups.
- A branch can be checked out in only one worktree. If `git switch` says "already used by worktree", go to that worktree or remove it; do not force.

### 1.7 Stale and abandoned branches

- A work branch with no commits for **30 days** and no open PR is stale. Anyone may ask the owner; after 14 days without reply it is deleted.
- If the work might matter, archive it instead of keeping the branch: `git tag archive/<branch-name> <sha> && git push origin archive/<branch-name>`, then delete the branch. Archive tags are the only tag namespace besides `vX.Y.Z`.
- Unmerged work is never "left in case". Either open a draft PR (visible, reviewed, closeable) or archive it.

---

## 2. Commit Messages — Conventional Commits

`type(scope): summary` — imperative, lowercase, ≤ 72 chars, no trailing period.

```
feat(subjects): add Subject CRUD endpoints
fix(exams): reject submission when server time > endTime
refactor(class): extract assertCourseAccess ownership gate
chore(docker): add redis AOF persistence + healthchecks
docs(architecture): switch topology to single-VPS Compose
feat(payments)!: require slip approval before marking SUCCESS
```

| Type | When |
|------|------|
| `feat` | New user-facing capability |
| `fix` | Bug fix |
| `refactor` | Internal change, no behaviour change |
| `chore` | Build, deps, config, tooling |
| `docs` | Documentation only |
| `test` | Tests only |
| `perf` | Performance |
| `ci` | GitHub Actions / pipeline only |
| `revert` | Reverting an earlier commit (`revert: feat(x): ...`, body names the SHA) |

- **Scope** = the domain: `auth`, `users`, `organizations`, `subjects`, `class`, `exams`, `submissions`, `payments`, `attendance`, `video`, `stream`, `markers`, `docker`, `infra`, `requirements`, `delivery`.
- One logical change per commit. Body (optional) explains **why**, not what. Reference issues: `Refs #42`, `Closes #42`.
- **Breaking change**: `!` after the scope and/or a `BREAKING CHANGE:` footer. Required for API contract changes, env var renames, and destructive migrations.
- A schema change and its code go in the **same** commit/PR so the tree is never half-migrated.
- Never commit secrets, `.env`, tokens, or customer data. If one slips in, rotate it first; history rewriting is secondary.
- Never `--no-verify` to skip hooks, and never `git commit --amend` a commit that is already pushed and reviewed.
- Because PRs are squash-merged, the **PR title** becomes the commit on `dev`: it must itself be a valid Conventional Commit.
- AI-assisted commits keep the trailer the tooling adds (`Co-Authored-By: ...`); do not strip it.

---

## 3. Pull Requests

- **One feature per PR.** Small PRs review faster and revert cleanly.
- Base is `dev`. The only PRs into `main` are releases (§5.1) and hotfixes (§5.2).
- **Squash-merge** into `dev` so history stays one-commit-per-feature. Release PRs are the exception (§5.1).
- Merge requires: **CI green** (`Quality Gate`, which needs Backend and Frontend jobs) and **one review** where a human reviewer is available. Solo/agent-authored PRs get an independent review pass (a second reviewer or an automated review) before merge.
- Backend and frontend lint are required CI checks. The backend baseline covers application code and unit tests; legacy live-stack diagnostic scripts excluded from `tsconfig.json` remain a documented follow-up rather than being silently treated as lint-clean.
- PR description states: what changed, why, how tested, and any migration/ops step (e.g. "run `prisma migrate deploy`").
- Docs-only PRs still go through CI and review. Docs that contradict code are bugs; verify facts against source.
- Never merge red CI or a partial migration. If blocked, keep the PR in draft.

PR checklist (paste into the description):

```markdown
- [ ] Branch is from current `origin/dev`; one task only
- [ ] PR title is a Conventional Commit
- [ ] Tests added/updated; `npm run test`, `tsc --noEmit` (backend + frontend) pass locally
- [ ] Schema change + migration in this PR; `prisma migrate diff` shows zero drift
- [ ] Docs updated where behaviour/contract changed (`context/documents/`)
- [ ] No secrets, no `.env`, no unrelated files
- [ ] Breaking change flagged with `!` / `BREAKING CHANGE:`
```

---

## 4. Naming Conventions (consolidated)

The authoritative style lives in [03-code-standards.md](./03-code-standards.md); this is the quick reference.

### 4.1 Files & code

| Element | Convention | Example |
|---------|-----------|---------|
| Backend files | `domain.layer.ts` | `payment.service.ts`, `subject.routes.ts` |
| React components | `PascalCase.tsx` | `ExamTimer.tsx` |
| Other frontend files | `kebab-case.ts` | `api-client.ts` |
| Functions / vars | `camelCase` | `assertCourseAccess`, `getStudentById` |
| Types / interfaces | `PascalCase` | `AuthenticatedUser`, `PaymentRecord` |
| Zod schemas | `camelCase` + `Schema` | `createSubjectSchema` |
| Constants / env keys | `UPPER_SNAKE_CASE` | `MAX_UPLOAD_SIZE_MB`, `DATABASE_URL` |
| React hooks | `use` + `PascalCase` | `useAuthStore` |

### 4.2 Database (Prisma)

| Element | Convention | Example |
|---------|-----------|---------|
| Models | `PascalCase`, singular | `Course`, `ClassSession`, `MarkerAssignment` |
| Fields | `camelCase` | `teacherId`, `paymentMonth`, `deletedAt` |
| Enums | `PascalCase` name, `UPPER_SNAKE_CASE` values | `Role.SUPER_ADMIN`, `PaymentMethod.ENTRANCE` |
| FK field | `<relation>Id` | `subjectId`, `enrollmentId`, `collectedById` |
| Booleans | `is`/`has` prefix | `isActive`, `isPublished` |
| Timestamps | `createdAt`, `updatedAt`, soft-delete `deletedAt` | — |
| Composite unique | business rule at DB level | `@@unique([subjectId, name, year])` |

### 4.3 API routes

- Base: `/api/<plural-resource>` in `kebab-case` → `/api/subjects`, `/api/class-sessions` (nested under `/api/classes/:classId/sessions`), `/api/audit-logs`.
- Nest child resources under the parent: `/api/classes/:classId/sessions/:sessionId`.
- Actions as sub-paths when not plain CRUD: `POST /api/exams/:id/assign-markers`, `PATCH /api/payments/:id/override`.
- Response envelope is always `{ status, data, message?, count?, code? }` (see 07 §API Response Format).

### 4.4 Branches, commits, env

- Branches: `type/kebab-scope` (§1.1). Commits: `type(scope): summary` (§2).
- Env vars: `UPPER_SNAKE_CASE`, grouped by service (`R2_*`, `BUNNY_*`, `PAYHERE_*`, `NOTIFY_*`); every one registered and validated in `backend/src/config/env.ts` (fail-fast at boot). Never commit `.env`.

---

## 5. Releases and Hotfixes

### 5.1 Release (`dev` → `main`)

1. Confirm `dev` CI is green and the batch has been exercised on staging.
2. Open a PR `dev → main` titled `release: vX.Y.Z`. List the included PRs in the body (`gh pr list --state merged --base dev --search "merged:>=<last-release-date>"`), plus migration/ops steps.
3. Merge with a **merge commit** (not squash, not rebase). Squashing would make `main` diverge from `dev` and every later release PR would re-show already-shipped commits.
4. Tag the merge commit on `main` with an annotated tag: `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`. Current baseline: `v0.1.0`.
5. Versioning: SemVer. `0.x` while pre-launch; any breaking API/env/migration change bumps the minor (major after 1.0).

### 5.2 Hotfix

1. `git switch -c hotfix/<scope> origin/main`; fix; PR into `main`; CI green; merge commit; tag a patch release.
2. **Back-merge immediately**: open a PR `main → dev` (merge commit) so `dev` contains the fix. A hotfix that exists only on `main` is the same failure as the stranded `dev-backend` CORS fix.
3. If the same change also exists on `dev`, resolve in the back-merge, not by force-pushing.

---

## 6. Protected Branch Settings (GitHub)

Applied to both `dev` and `main` (2026-11-19):

| Setting | Value |
|---------|-------|
| Require a pull request before merging | on, 0 required approvals while the team is solo/agent-heavy; raise to 1 once a second maintainer reviews regularly |
| Require status checks | `Quality Gate` (aggregates Backend + Frontend) |
| Require branches to be up to date | off (avoids serial re-runs; rebase when the PR touches migrations) |
| Allow force pushes | off |
| Allow deletions | off |
| Enforce for administrators | off (owner can break glass; do not use it for routine merges) |
| Automatically delete head branches | on (repo setting) |
| Allowed merge methods | squash (default), merge commit (release/hotfix/back-merge only) |

Repository: `DimathJayasinghe/LMS`. Changing these settings needs the repo owner; record any change in [06-progress-tracker.md](./06-progress-tracker.md).

---

## 7. Cleanup Runbook

Run monthly, or whenever `git branch -a | wc -l` passes ~15.

```bash
git fetch --prune origin
# remote branches whose tip is already in dev
git branch -r --merged origin/dev | grep -v -E 'origin/(dev|main|HEAD)'
# squash-merged branches are NOT listed above; check by PR instead
gh pr list --state merged --base dev --json headRefName,headRefOid --limit 200
gh pr list --state open --json headRefName
```

A branch is **safe to delete** when either (a) its tip is an ancestor of `origin/dev`, or (b) its tip SHA equals the head SHA of a PR merged into `dev`/`main`. Anything else is **unmerged**: list it, ask the owner, then archive (§1.7) or delete.

Order of operations:

1. List candidates and show them to the owner. Do not delete from an unconfirmed list.
2. Remove worktrees for those branches (`git worktree remove`, `git worktree prune`).
3. Delete remote: `git push origin --delete <name> [<name> ...]`.
4. Delete local: `git branch -D <name>`; `git fetch --prune`.
5. Bundle unmerged work before deleting it: `git bundle create ../backup-<name>.bundle <name>`.
6. Note the cleanup (date, counts) in the tracker.

---

## 8. AI-Agent Session Rules

Agents (Claude Code and similar) follow everything above plus:

- Work in the **main checkout**, not a worktree, unless the owner says otherwise. Check `git branch --show-current` and `git status` before any write.
- Branch from fresh `origin/dev`. Never commit to `dev`/`main`.
- Do not chain destructive steps after a command that can fail (`git switch ... && cp ...`). Verify the branch first, then write.
- Never run bare `git stash` / `git stash pop`. To park someone's uncommitted work: `git stash push -u -m "<tag>"`, then restore with `git stash apply <sha>` and drop only after verifying.
- Stage explicit paths, never `git add -A`/`.` in a checkout that may hold other people's changes.
- Ask before deleting branches, force-pushing, or changing GitHub settings, unless the owner already instructed that exact action in the session.
- After opening a PR: wait for CI, run an independent review, fix findings, then merge only if the owner authorized merging.

---

## 9. Quick Do / Don't

| ✅ Do | ❌ Don't |
|------|---------|
| Branch off fresh `origin/dev`, one task, short-lived | Commit straight to `dev` or `main` |
| `feat(exams): ...` conventional commits, PR title too | `update stuff`, `wip`, `fix2` |
| Squash-merge via PR once CI is green | Merge red/untested code or a partial migration |
| Ship schema + code together | Split a migration across PRs |
| Delete the branch after merge; start a new branch for follow-ups | Keep merged branches or reuse their names |
| Merge-commit releases, tag `vX.Y.Z`, back-merge hotfixes | Squash a release PR; leave a fix only on `main` |
| `--force-with-lease` on your own branch | `--force`, or force-push `dev`/`main` |
| `type/kebab-scope` | `yourname/dev/thing`, long-lived lanes |
| `domain.layer.ts` + `camelCase` fields | Mixed casing, `snake_case` in TS |

---

## 10. Decision History

- **2026-07-10** — "Never commit straight to dev" restated for agent sessions. "Never delete a branch after merging" added because the owner kept working on merged branches.
- **2026-11-19** — Rule reversed. Audit found 52 merged-but-undeleted remote branches (39 local), 15 abandoned unmerged branch names (remote and local copies counted once), and 2 stale worktrees of merged branches. Squash-merge makes "merged" undetectable by `git branch --merged`, which made the pile unauditable. Decisions: delete after merge; auto-delete on GitHub; protect `dev` and `main`; no personal branch prefixes; no long-lived lanes; `hotfix/` and release flow defined; cleanup runbook added. The 15 unmerged branches were deleted at the owner's request.
